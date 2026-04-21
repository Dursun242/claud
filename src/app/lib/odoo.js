/**
 * Service Odoo JSON-RPC
 * Utilisé côté serveur uniquement (routes API Next.js)
 */

import { fetchWithRetry } from './fetchWithRetry'

const ODOO_URL = process.env.ODOO_URL
const ODOO_DB = process.env.ODOO_DB
const ODOO_USER = process.env.ODOO_USER
const ODOO_API_KEY = process.env.ODOO_API_KEY

async function jsonrpc(service, method, args) {
  if (!ODOO_URL) throw new Error('Variable ODOO_URL manquante dans Vercel')
  let res
  try {
    res = await fetchWithRetry(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 ID-Maitrise/1.0',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
      cache: 'no-store',
      // Odoo Sign peut être long sur des actions lourdes (création sign.request
      // avec PDF 10-20 Mo) : 30s au lieu du défaut 15s.
      timeoutMs: 30000,
    })
  } catch (err) {
    throw new Error(`Connexion Odoo impossible (${ODOO_URL}) : ${err.message}`)
  }
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}: ${res.statusText}`)
  const json = await res.json()
  if (json.error) {
    const msg = json.error.data?.message || json.error.message || 'Odoo error'
    throw new Error(msg)
  }
  return json.result
}

// Cache module-level du UID Odoo : authenticate() coûte ~100-300 ms, et une
// création de sign.request enchaîne ~10 execute_kw → on économise ~1s.
// TTL 55 min (sessions Odoo typiquement 1 h).
const UID_TTL_MS = 55 * 60 * 1000
let uidCache = { uid: null, expiresAt: 0 }

async function getUid() {
  const now = Date.now()
  if (uidCache.uid && now < uidCache.expiresAt) return uidCache.uid
  const uid = await jsonrpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}])
  if (!uid) throw new Error('Authentification Odoo échouée — vérifiez les credentials')
  uidCache = { uid, expiresAt: now + UID_TTL_MS }
  return uid
}

function invalidateUidCache() { uidCache = { uid: null, expiresAt: 0 } }

async function execute(model, method, args = [], kwargs = {}) {
  const uid = await getUid()
  try {
    return await jsonrpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs])
  } catch (err) {
    // Session expirée côté Odoo : on invalide le cache et on retente une fois.
    if (/session|authentication|access denied/i.test(err.message)) {
      invalidateUidCache()
      const freshUid = await getUid()
      return jsonrpc('object', 'execute_kw', [ODOO_DB, freshUid, ODOO_API_KEY, model, method, args, kwargs])
    }
    throw err
  }
}

// ─── Méthodes publiques ──────────────────────

/** Teste la connexion Odoo */
/** Inspecte les champs d'un modèle Odoo (diagnostic) */
export async function inspectModel(model) {
  return execute(model, 'fields_get', [], { attributes: ['string', 'type', 'readonly', 'required'] })
}

export async function testConnection() {
  const version = await jsonrpc('common', 'version', [])
  const uid = await getUid()
  return { ok: true, version: version.server_version, uid }
}

/** Récupère les templates Odoo Sign disponibles */
export async function getSignTemplates() {
  return execute('sign.template', 'search_read', [[['active', '=', true]]], {
    fields: ['id', 'name', 'sign_item_ids'],
    limit: 100,
  })
}

/** Récupère les rôles de signataire disponibles dans un template */
export async function getTemplateRoles(templateId) {
  // Les rôles sont définis dans sign.item.role
  const items = await execute('sign.item', 'search_read', [[['template_id', '=', templateId]]], {
    fields: ['id', 'responsible_id'],
  })
  const roleIds = [...new Set(items.map(i => i.responsible_id?.[0]).filter(Boolean))]
  if (!roleIds.length) {
    // Récupérer le rôle par défaut
    const defaultRoles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'], limit: 10 })
    return defaultRoles
  }
  return execute('sign.item.role', 'search_read', [[['id', 'in', roleIds]]], { fields: ['id', 'name'] })
}

/** Trouve ou crée un partenaire Odoo par email */
export async function findOrCreatePartner({ name, email }) {
  if (!email) throw new Error('Email requis pour créer un signataire')
  // On ne considère un nom "réel" que s'il est fourni, non vide, et différent
  // de la string "undefined" (piège classique JS → sérialisation).
  const haveRealName = !!(name && String(name).trim() && String(name).trim().toLowerCase() !== 'undefined')
  const cleanName = haveRealName ? String(name).trim() : email
  const existing = await execute('res.partner', 'search_read', [[['email', '=', email]]], {
    fields: ['id', 'name'],
    limit: 1,
  })
  if (existing.length) {
    const currentName = existing[0].name
    // On met à jour le partner si :
    //   a) on a un vrai nom fourni ET qu'il diffère du nom actuel → on utilise
    //      toujours la donnée la plus fraîche venant de l'app.
    //   b) OU le nom actuel est foireux ("undefined", vide, email) → on corrige
    //      même si on n'a pas de meilleur nom, en mettant l'email faute de mieux.
    const currentIsBroken = !currentName || currentName === 'undefined' || currentName === email
    const shouldUpdate = (haveRealName && cleanName !== currentName)
      || (currentIsBroken && cleanName !== currentName)
    if (shouldUpdate) {
      try { await execute('res.partner', 'write', [[existing[0].id], { name: cleanName }]) }
      catch (e) { console.warn('[OdooSign] update partner name échoué:', e.message) }
    }
    return existing[0].id
  }
  return execute('res.partner', 'create', [{ name: cleanName, email }])
}

/**
 * Crée et envoie une demande de signature Odoo
 * @param {Object} params
 * @param {number} params.templateId - ID du template Odoo Sign
 * @param {string} params.signerName - Nom du signataire
 * @param {string} params.signerEmail - Email du signataire
 * @param {string} params.reference - Référence (numéro OS)
 */
export async function createSignRequest({ templateId, signerName, signerEmail, reference }) {
  // 1. Trouver ou créer le partenaire
  const partnerId = await findOrCreatePartner({ name: signerName, email: signerEmail })

  // 2. Récupérer le premier rôle du template
  const roles = await getTemplateRoles(templateId)
  if (!roles.length) throw new Error('Aucun rôle de signataire trouvé dans ce template')
  const roleId = roles[0].id

  // 3. Créer la demande de signature avec state='sent' pour déclencher l'envoi auto
  let requestId
  try {
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId,
      reference: reference || '',
      state: 'sent',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
  } catch (_) {
    // Fallback sans state (certaines versions n'acceptent pas state à la création)
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId,
      reference: reference || '',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
    // Essai envoi post-création ; on s'arrête dès qu'une méthode répond.
    const sendMethods = ['action_send_request', 'send_signature_accesses', 'action_sign_send', 'action_validate']
    let sent = false
    for (const method of sendMethods) {
      try { await execute('sign.request', method, [[requestId]]); sent = true; break } catch (_) {}
    }
    // Le write state='sent' n'est qu'un fallback si aucune action n'a abouti.
    if (!sent) await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
  }

  // 5. Récupérer l'URL de la demande
  const requestData = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'reference', 'state', 'request_item_ids'],
  })

  const signUrl = `${ODOO_URL}/odoo/sign/${requestId}`
  return { requestId, signUrl, state: requestData[0]?.state || 'sent' }
}

/**
 * Crée une demande de signature depuis un PDF base64
 * @param {Object} params
 * @param {string} params.pdfBase64       - dataURI base64 du PDF
 * @param {string} params.reference       - Numéro OS (ex: OS-2026-020)
 * @param {string} params.operationName   - Nom du chantier (pour l'objet email)
 * @param {Array}  params.signers         - [{name, email, role}] role ∈ 'MOE'|'MOA'|'Entreprise'
 */
export async function createSignRequestFromPdf({ pdfBase64, reference, operationName, signers }) {
  // Validation du PDF : taille et signature MIME
  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    throw new Error('PDF manquant ou invalide')
  }
  const b64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64

  // Taille max 20 Mo (un PDF base64 fait ~4/3 du binaire)
  const MAX_BYTES = 20 * 1024 * 1024
  const approxBytes = Math.floor(b64.length * 0.75)
  if (approxBytes > MAX_BYTES) {
    throw new Error(`PDF trop volumineux (${Math.round(approxBytes / 1024 / 1024)} Mo, max 20 Mo)`)
  }

  // Signature %PDF (en base64 : "JVBER" ou "JVBERi")
  if (!b64.startsWith('JVBER')) {
    throw new Error('Le fichier ne semble pas être un PDF valide')
  }

  const filename = `${reference || 'OS'}.pdf`
  // Le sujet reste neutre (pas préfixé "OS") car la fonction est aussi utilisée
  // par les PV de réception. La référence elle-même contient déjà le type
  // (ex: "OS-2026-020" ou "PV-2026-001").
  const subject = operationName
    ? `Signature requise – ${reference} – ${operationName}`
    : `Signature requise – ${reference}`

  // Validation des signataires fournis.
  // Les callers décident qui est obligatoire (OS passe MOE+MOA+Entreprise,
  // PV passe MOE+MOA, Entreprise optionnelle). On s'assure seulement que :
  //   - il y a au moins un signataire avec email,
  //   - chaque signataire fourni a bien un email valide,
  //   - le rôle est dans la liste connue { MOE, MOA, Entreprise }.
  const KNOWN_ROLES = ['MOE', 'MOA', 'Entreprise']
  const cleanSigners = (signers || []).filter(s => s && s.email)
  if (!cleanSigners.length) {
    throw new Error('Au moins un signataire avec email requis')
  }
  for (const s of cleanSigners) {
    if (!KNOWN_ROLES.includes(s.role)) {
      throw new Error(`Rôle signataire inconnu : ${s.role} (attendu : ${KNOWN_ROLES.join(', ')})`)
    }
  }
  // Rôles effectivement à faire signer (dédupliqués)
  const activeRoles = [...new Set(cleanSigners.map(s => s.role))]

  // ── A : ir.attachment ─────────────────
  const attId = await execute('ir.attachment', 'create', [{
    name: filename, type: 'binary', datas: b64, mimetype: 'application/pdf',
  }])

  // ── B : sign.template ─────────────────
  const templateId = await execute('sign.template', 'create', [{ name: filename }])

  // ── C : sign.document ─────────────────
  const signDocId = await execute('sign.document', 'create', [{
    name: filename, template_id: templateId, attachment_id: attId,
  }])
  const docRead = await execute('sign.document', 'read', [[signDocId]], { fields: ['id', 'attachment_id'] })
  if (!docRead[0]?.attachment_id) throw new Error('sign.document créé sans attachment_id')

  // ── C-bis : détection du champ de rattachement sign.item ─────────────────
  // Selon la version d'Odoo, sign.item est rattaché à template_id ou à
  // document_id. On introspecte une fois pour le déterminer.
  let signItemFields
  try {
    signItemFields = await execute('sign.item', 'fields_get', [['template_id', 'document_id']], {
      attributes: ['string', 'required'],
    })
  } catch (_) { signItemFields = {} }
  const useDocumentId = !!signItemFields.document_id
  const parentField = useDocumentId ? 'document_id' : 'template_id'
  const parentId = useDocumentId ? signDocId : templateId

  // ── C-ter : nettoyage sign.items auto-générés ──
  // Odoo peut créer automatiquement des sign.items (rôle "Customer") lors de
  // la création du sign.document depuis un PDF. On purge tout pour ne garder
  // que nos 3 zones MOE/MOA/Entreprise.
  try {
    const existingItems = await execute('sign.item', 'search', [[[parentField, '=', parentId]]])
    if (existingItems.length) {
      await execute('sign.item', 'unlink', [existingItems])
    }
  } catch (e) {
    console.warn('[OdooSign] purge sign.items préexistants:', e.message)
  }

  // ── D : Rôles (find or create) ────────
  // Noms courts sans apostrophe : pas de collision avec les rôles Odoo par
  // défaut (Customer, Employee…) et rendu propre dans le PDF signé.
  // On ne crée que les rôles réellement utilisés (activeRoles) pour éviter
  // des zones de signature orphelines quand un rôle est optionnel (ex PV
  // sans Entreprise).
  const ROLE_NAMES = { MOE: 'MOE', MOA: 'MOA', Entreprise: 'Entreprise' }
  const roleIds = {}
  const labels = activeRoles.map(k => ROLE_NAMES[k])
  // Un seul search_read pour TOUS les rôles actifs (évite N+1).
  const foundRoles = await execute('sign.item.role', 'search_read',
    [[['name', 'in', labels]]],
    { fields: ['id', 'name'] }
  )
  const byName = new Map(foundRoles.map(r => [r.name, r.id]))
  for (const key of activeRoles) {
    const label = ROLE_NAMES[key]
    const existing = byName.get(label)
    roleIds[key] = existing != null
      ? existing
      : await execute('sign.item.role', 'create', [{ name: label }])
  }

  // ── E : sign.item.type + zones de signature (FAIL FAST si échec) ─────────
  const signTypes = await execute('sign.item.type', 'search_read', [[['item_type', '=', 'signature']]], {
    fields: ['id', 'name'], limit: 1,
  })
  const signTypeId = signTypes[0]?.id
    || (await execute('sign.item.type', 'search_read', [[]], { fields: ['id'], limit: 1 }))[0]?.id
  if (!signTypeId) throw new Error('Aucun sign.item.type disponible dans Odoo — module Sign mal configuré')

  // Positions X possibles pour une ligne de signatures en bas de page.
  // On répartit uniformément selon le nombre de rôles actifs (1, 2 ou 3)
  // pour garder un rendu propre même si Entreprise est absent (cas PV).
  const ROLE_ORDER = ['MOE', 'MOA', 'Entreprise']
  const orderedRoles = ROLE_ORDER.filter(r => activeRoles.includes(r))
  const N = orderedRoles.length
  const ZONE_WIDTH = 0.28
  const ZONE_HEIGHT = 0.12
  const totalWidth = 0.94
  const slot = totalWidth / N
  const ZONES = orderedRoles.map((role, i) => ({
    role,
    posX: 0.03 + i * slot + (slot - ZONE_WIDTH) / 2,
    posY: 0.82,
  }))
  for (const z of ZONES) {
    const rId = roleIds[z.role]
    if (!rId) throw new Error(`Rôle Odoo manquant pour ${z.role}`)
    try {
      await execute('sign.item', 'create', [{
        [parentField]: parentId,
        responsible_id: rId,
        required: true, type_id: signTypeId,
        posX: z.posX, posY: z.posY, width: ZONE_WIDTH, height: ZONE_HEIGHT, page: 1,
      }])
    } catch (e) {
      throw new Error(`Création zone signature ${z.role} échouée : ${e.message}`)
    }
  }

  // ── Lire les rôles RÉELS du template (source de vérité pour Odoo) ─────────
  const templateItems = await execute('sign.item', 'search_read',
    [[[parentField, '=', parentId]]],
    { fields: ['id', 'responsible_id'] }
  )
  const requiredRoleIds = [...new Set(templateItems.map(i => i.responsible_id?.[0]).filter(Boolean))]

  // ── F : Partenaires ────────────────────
  const roleToPartner = {}
  for (const s of signers) {
    if (!s.email) continue
    const partnerId = await findOrCreatePartner({ name: s.name, email: s.email })
    if (roleIds[s.role]) roleToPartner[roleIds[s.role]] = partnerId
  }

  // ── G : request_items couvrant EXACTEMENT les rôles du template ───────────
  // Validation stricte : chaque rôle du template DOIT avoir un partenaire
  const missingRoles = requiredRoleIds.filter(rId => !roleToPartner[rId])
  if (missingRoles.length) {
    const reverseLookup = Object.fromEntries(Object.entries(roleIds).map(([k, v]) => [v, k]))
    const missingNames = missingRoles.map(rId => reverseLookup[rId] || `role#${rId}`)
    throw new Error(`Signataire manquant pour : ${missingNames.join(', ')}`)
  }
  const requestItems = requiredRoleIds.map(rId => [0, 0, { partner_id: roleToPartner[rId], role_id: rId }])

  if (!requestItems.length) throw new Error('Aucun request_item à créer — vérifiez les emails et rôles')

  // ── H : sign.request ───────────────────
  const requestId = await execute('sign.request', 'create', [{
    template_id: templateId,
    reference: reference || '',
    request_item_ids: requestItems,
  }])

  // ── I : Subject + email_from avant envoi ──
  try {
    await execute('sign.request', 'write', [[requestId], {
      subject,
      email_from: `Id Maîtrise <${ODOO_USER}>`,
      reply_to: `Id Maîtrise <${ODOO_USER}>`,
    }])
  } catch (_) {
    try { await execute('sign.request', 'write', [[requestId], { subject }]) }
    catch (e) { console.warn('[OdooSign] subject non supporté:', e.message) }
  }

  // ── J : Envoi ──────────────────────────
  let sent = false
  for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send']) {
    try { await execute('sign.request', m, [[requestId]]); sent = true; break }
    catch (_) {}
  }
  if (!sent) {
    try { await execute('sign.request', 'write', [[requestId], { state: 'sent' }]) }
    catch (e) { console.warn('[OdooSign] envoi fallback échoué:', e.message) }
  }

  return { requestId, signUrl: `${ODOO_URL}/odoo/sign/${requestId}`, state: 'sent', subject }
}

/** Vérifie le statut d'une demande de signature + qui a signé */
export async function getSignRequestStatus(requestId) {
  const data = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference', 'request_item_ids'],
  })
  if (!data.length) throw new Error('Demande de signature introuvable')
  const req = data[0]

  // Détail par signataire : id, état, nom partner, rôle, date de signature
  let items = []
  if (req.request_item_ids?.length) {
    items = await execute('sign.request.item', 'read', [req.request_item_ids], {
      fields: ['id', 'state', 'partner_id', 'role_id', 'signing_date'],
    })
  }
  return { ...req, items }
}

/**
 * Pour un ensemble de requestIds, retourne leur statut consolidé.
 * state Odoo : 'sent' | 'signed' | 'canceled' | 'expired' | 'refused'
 *
 * Mapping vers notre statut_signature :
 *   - 'Signé'                si state = 'signed' (tous ont signé)
 *   - 'Partiellement signé'  si au moins 1 item signé mais pas tous
 *   - 'Envoyé'               si aucun item signé encore
 *   - 'Refusé'               si state = 'refused'
 *   - 'Expiré'               si state = 'expired'
 *   - 'Annulé'               si state = 'canceled'
 */
export async function getSignRequestsStatusBulk(requestIds) {
  if (!requestIds?.length) return []
  const reqs = await execute('sign.request', 'read', [requestIds], {
    fields: ['id', 'state', 'reference', 'request_item_ids'],
  })
  // Un seul round-trip pour charger TOUS les items
  const allItemIds = reqs.flatMap(r => r.request_item_ids || [])
  let itemsById = new Map()
  if (allItemIds.length) {
    const items = await execute('sign.request.item', 'read', [allItemIds], {
      fields: ['id', 'state', 'partner_id', 'role_id', 'signing_date'],
    })
    itemsById = new Map(items.map(i => [i.id, i]))
  }

  return reqs.map(r => {
    const myItems = (r.request_item_ids || []).map(id => itemsById.get(id)).filter(Boolean)
    const total = myItems.length
    const signed = myItems.filter(i => i.state === 'signed' || i.state === 'completed').length

    let statut = 'Envoyé'
    if (r.state === 'signed')        statut = 'Signé'
    else if (r.state === 'refused')  statut = 'Refusé'
    else if (r.state === 'expired')  statut = 'Expiré'
    else if (r.state === 'canceled') statut = 'Annulé'
    else if (signed > 0 && signed < total) statut = 'Partiellement signé'

    return {
      requestId: r.id,
      state: r.state,
      statut_signature: statut,
      signed_count: signed,
      total_count: total,
      items: myItems,
    }
  })
}

/**
 * Récupère le PDF signé final d'une sign.request.
 *
 * Selon la version d'Odoo, le document signé est exposé différemment :
 *   - `completed_document` : champ Binary sur sign.request (versions récentes)
 *   - `ir.attachment` rattaché via res_model='sign.request' + res_id
 *
 * On essaie les deux et on retourne le premier qui marche.
 *
 * @param {number} requestId
 * @returns {Promise<{ base64: string, filename: string, mimetype: string } | null>}
 */
export async function getCompletedDocument(requestId) {
  if (!requestId) return null

  // Vérifier d'abord le statut — inutile d'essayer si pas encore signé.
  const [req] = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference', 'completed_document'],
  })
  if (!req) return null
  if (req.state !== 'signed') return null

  const refName = req.reference || `signature-${requestId}`
  const baseFilename = `${refName}.pdf`

  // Cas 1 : champ completed_document directement sur sign.request
  if (req.completed_document) {
    return {
      base64: req.completed_document,
      filename: baseFilename,
      mimetype: 'application/pdf',
    }
  }

  // Cas 2 : attachments rattachés à sign.request
  const attachments = await execute(
    'ir.attachment',
    'search_read',
    [[['res_model', '=', 'sign.request'], ['res_id', '=', requestId]]],
    { fields: ['id', 'name', 'datas', 'mimetype'] }
  )
  if (!attachments.length) return null

  // Priorité aux PDF, et au nom qui contient "signed" ou "completed" si dispo
  attachments.sort((a, b) => {
    const aSigned = /sign|complet/i.test(a.name) ? 0 : 1
    const bSigned = /sign|complet/i.test(b.name) ? 0 : 1
    return aSigned - bSigned
  })
  const best = attachments.find(a => a.mimetype === 'application/pdf') || attachments[0]
  if (!best?.datas) return null

  return {
    base64: best.datas,
    filename: best.name || baseFilename,
    mimetype: best.mimetype || 'application/pdf',
  }
}
