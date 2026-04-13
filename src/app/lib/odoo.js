/**
 * Service Odoo JSON-RPC
 * Utilisé côté serveur uniquement (routes API Next.js)
 */

const ODOO_URL = process.env.ODOO_URL
const ODOO_DB = process.env.ODOO_DB
const ODOO_USER = process.env.ODOO_USER
const ODOO_API_KEY = process.env.ODOO_API_KEY

async function jsonrpc(service, method, args) {
  if (!ODOO_URL) throw new Error('Variable ODOO_URL manquante dans Vercel')
  let res
  try {
    res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 ID-Maitrise/1.0',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
      cache: 'no-store',
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

async function getUid() {
  const uid = await jsonrpc('common', 'authenticate', [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}])
  if (!uid) throw new Error('Authentification Odoo échouée — vérifiez les credentials')
  return uid
}

async function execute(model, method, args = [], kwargs = {}) {
  const uid = await getUid()
  return jsonrpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs])
}

// ─── Méthodes publiques ────────────────────────────────────────────────────────

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
  const existing = await execute('res.partner', 'search_read', [[['email', '=', email]]], {
    fields: ['id', 'name'],
    limit: 1,
  })
  if (existing.length) return existing[0].id
  return execute('res.partner', 'create', [{ name: name || email, email }])
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
    // Essai envoi post-création
    const sendMethods = ['action_send_request', 'send_signature_accesses', 'action_sign_send', 'action_validate']
    for (const method of sendMethods) {
      try { await execute('sign.request', method, [[requestId]]); break } catch (_) {}
    }
    await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
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
  const subject = operationName
    ? `Signature requise – OS ${reference} – ${operationName}`
    : `Signature requise – OS ${reference}`

  // Validation stricte : 3 signataires obligatoires
  const REQUIRED_ROLES = ['MOE', 'MOA', 'Entreprise']
  const ROLE_LABELS = { MOE: 'MOE (Id Maîtrise)', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
  for (const role of REQUIRED_ROLES) {
    const s = signers?.find(x => x.role === role)
    if (!s?.email) throw new Error(`Email obligatoire pour le rôle ${ROLE_LABELS[role]}`)
  }
  if (signers.length !== 3) throw new Error(`3 signataires requis (MOE, Maître d'ouvrage, Entreprise), ${signers.length} fourni(s)`)

  // ── A : ir.attachment ────────────────────────────────────────────────────
  const attId = await execute('ir.attachment', 'create', [{
    name: filename, type: 'binary', datas: b64, mimetype: 'application/pdf',
  }])

  // ── B : sign.template ────────────────────────────────────────────────────
  const templateId = await execute('sign.template', 'create', [{ name: filename }])

  // ── C : sign.document ────────────────────────────────────────────────────
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

  // ── C-ter : nettoyage sign.items auto-générés ─────────────────────────────
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

  // ── D : Rôles (find or create) — noms uniques pour éviter les collisions ─
  // Préfixe "IDM" pour ne pas dépendre des rôles par défaut Odoo dont le nom
  // peut varier (apostrophe typographique, traduction, etc.)
  const ROLE_NAMES = { MOE: 'IDM - MOE', MOA: "IDM - Maître d'ouvrage", Entreprise: 'IDM - Entreprise' }
  const roleIds = {}
  for (const [key, label] of Object.entries(ROLE_NAMES)) {
    const found = await execute('sign.item.role', 'search_read', [[['name', '=', label]]], {
      fields: ['id', 'name'], limit: 1,
    })
    if (found.length) {
      roleIds[key] = found[0].id
    } else {
      roleIds[key] = await execute('sign.item.role', 'create', [{ name: label }])
    }
  }

  // ── E : sign.item.type + zones de signature (FAIL FAST si échec) ─────────
  const signTypes = await execute('sign.item.type', 'search_read', [[['item_type', '=', 'signature']]], {
    fields: ['id', 'name'], limit: 1,
  })
  const signTypeId = signTypes[0]?.id
    || (await execute('sign.item.type', 'search_read', [[]], { fields: ['id'], limit: 1 }))[0]?.id
  if (!signTypeId) throw new Error('Aucun sign.item.type disponible dans Odoo — module Sign mal configuré')

  const ZONES = [
    { role: 'MOE',        posX: 0.03, posY: 0.82 },
    { role: 'MOA',        posX: 0.37, posY: 0.82 },
    { role: 'Entreprise', posX: 0.68, posY: 0.82 },
  ]
  for (const z of ZONES) {
    const rId = roleIds[z.role]
    if (!rId) throw new Error(`Rôle Odoo manquant pour ${z.role}`)
    try {
      await execute('sign.item', 'create', [{
        [parentField]: parentId,
        responsible_id: rId,
        required: true, type_id: signTypeId,
        posX: z.posX, posY: z.posY, width: 0.28, height: 0.12, page: 1,
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

  // ── F : Partenaires ──────────────────────────────────────────────────────
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

  // ── H : sign.request ─────────────────────────────────────────────────────
  const requestId = await execute('sign.request', 'create', [{
    template_id: templateId,
    reference: reference || '',
    request_item_ids: requestItems,
  }])

  // ── I : Subject + email_from avant envoi ─────────────────────────────────
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

  // ── J : Envoi ─────────────────────────────────────────────────────────────
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

/** Vérifie le statut d'une demande de signature */
export async function getSignRequestStatus(requestId) {
  const data = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference'],
  })
  if (!data.length) throw new Error('Demande de signature introuvable')
  return data[0]
}
