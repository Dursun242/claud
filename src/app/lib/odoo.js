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
  console.log('[OdooSign] A — attId:', attId)

  // ── B : sign.template (lié directement à l'attachment) ───────────────────
  // sign.document n'existe pas dans Odoo Sign standard — attachment_id suffit
  const templateId = await execute('sign.template', 'create', [{
    name: filename,
    attachment_id: attId,
  }])
  console.log('[OdooSign] B — templateId:', templateId)

  // ── D : Rôles (find or create) ───────────────────────────────────────────
  const ROLE_NAMES = { MOE: 'MOE', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
  const existingRoles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'] })
  console.log('[OdooSign] D — rôles Odoo:', existingRoles.map(r => `${r.id}:${r.name}`).join(', '))

  const roleIds = {}
  for (const [key, label] of Object.entries(ROLE_NAMES)) {
    const found = existingRoles.find(r => r.name.toLowerCase() === label.toLowerCase())
    if (found) {
      roleIds[key] = found.id
    } else {
      try { roleIds[key] = await execute('sign.item.role', 'create', [{ name: label }]) }
      catch (e) { roleIds[key] = existingRoles[0]?.id; console.warn('[OdooSign] D — fallback rôle pour', key) }
    }
  }
  console.log('[OdooSign] D — roleIds:', JSON.stringify(roleIds))

  // ── E : sign.item.type + zones de signature ──────────────────────────────
  const signTypes = await execute('sign.item.type', 'search_read', [[]], { fields: ['id', 'name'], limit: 1 })
  const signTypeId = signTypes[0]?.id

  const ZONES = [
    { role: 'MOE',        posX: 0.03, posY: 0.82 },
    { role: 'MOA',        posX: 0.37, posY: 0.82 },
    { role: 'Entreprise', posX: 0.68, posY: 0.82 },
  ]
  if (signTypeId) {
    for (const z of ZONES) {
      const rId = roleIds[z.role]
      if (!rId) continue
      try {
        const iId = await execute('sign.item', 'create', [{
          template_id: templateId, responsible_id: rId,
          required: true, type_id: signTypeId,
          pos_x: z.posX, pos_y: z.posY, width: 0.28, height: 0.12, page: 1,
        }])
        console.log('[OdooSign] E — sign.item', z.role, '→', iId)
      } catch (e) {
        console.warn('[OdooSign] E — sign.item', z.role, 'échec:', e.message)
      }
    }
  }

  // ── Lire les rôles RÉELS du template (source de vérité pour Odoo) ─────────
  const templateItems = await execute('sign.item', 'search_read',
    [[['template_id', '=', templateId]]],
    { fields: ['id', 'responsible_id'] }
  )
  const requiredRoleIds = [...new Set(templateItems.map(i => i.responsible_id?.[0]).filter(Boolean))]
  console.log('[OdooSign] E — rôles requis (lu template):', requiredRoleIds)

  // ── F : Partenaires ──────────────────────────────────────────────────────
  const roleToPartner = {}
  for (const s of signers) {
    if (!s.email) continue
    const partnerId = await findOrCreatePartner({ name: s.name, email: s.email })
    if (roleIds[s.role]) roleToPartner[roleIds[s.role]] = partnerId
    console.log('[OdooSign] F —', s.role, s.email, '→ partner', partnerId)
  }

  // ── G : request_items couvrant EXACTEMENT les rôles du template ───────────
  let requestItems
  if (requiredRoleIds.length > 0) {
    // Template a des sign.items → couvrir exactement ces rôles
    const fallbackPartnerId = Object.values(roleToPartner)[0]
    requestItems = requiredRoleIds.map(rId => {
      const partnerId = roleToPartner[rId] ?? fallbackPartnerId
      if (!partnerId) return null
      return [0, 0, { partner_id: partnerId, role_id: rId }]
    }).filter(Boolean)
  } else {
    // Template sans sign.items → ajouter tous les signataires avec leurs rôles
    requestItems = Object.entries(roleToPartner).map(([rId, partnerId]) =>
      [0, 0, { partner_id: partnerId, role_id: parseInt(rId) }]
    )
  }

  if (!requestItems.length) throw new Error('Aucun request_item à créer — vérifiez les emails et rôles')
  console.log('[OdooSign] G — requestItems count:', requestItems.length)

  // ── H : sign.request ─────────────────────────────────────────────────────
  const requestId = await execute('sign.request', 'create', [{
    template_id: templateId,
    reference: reference || '',
    request_item_ids: requestItems,
  }])
  console.log('[OdooSign] H — requestId:', requestId)

  // ── I : Subject + email_from avant envoi ─────────────────────────────────
  try {
    await execute('sign.request', 'write', [[requestId], {
      subject,
      email_from: `Id Maîtrise <${ODOO_USER}>`,
      reply_to: `Id Maîtrise <${ODOO_USER}>`,
    }])
    console.log('[OdooSign] I — subject + email_from définis')
  } catch (_) {
    try { await execute('sign.request', 'write', [[requestId], { subject }]) }
    catch (e) { console.warn('[OdooSign] I — subject non supporté:', e.message) }
  }

  // ── J : Envoi ─────────────────────────────────────────────────────────────
  let sent = false
  for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send']) {
    try { await execute('sign.request', m, [[requestId]]); sent = true; console.log('[OdooSign] J — envoyé via', m); break }
    catch (_) {}
  }
  if (!sent) {
    try { await execute('sign.request', 'write', [[requestId], { state: 'sent' }]); console.log('[OdooSign] J — state=sent') }
    catch (e) { console.warn('[OdooSign] J —', e.message) }
  }

  console.log('[OdooSign] DONE — requestId:', requestId, 'subject:', subject)
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
