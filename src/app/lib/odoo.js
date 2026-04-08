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
  const b64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
  const filename = `${reference || 'OS'}.pdf`
  const subject = operationName
    ? `Signature requise – OS ${reference} – ${operationName}`
    : `Signature requise – OS ${reference}`

  if (!signers?.length) throw new Error('Au moins un signataire requis')

  // ── A : ir.attachment ────────────────────────────────────────────────────
  console.log('[OdooSign] A — create ir.attachment', filename)
  const attId = await execute('ir.attachment', 'create', [{
    name: filename, type: 'binary', datas: b64, mimetype: 'application/pdf',
  }])
  console.log('[OdooSign] A — attId:', attId)

  // ── B : sign.template ────────────────────────────────────────────────────
  console.log('[OdooSign] B — create sign.template')
  const templateId = await execute('sign.template', 'create', [{ name: filename }])
  console.log('[OdooSign] B — templateId:', templateId)

  // ── C : sign.document (attachment_id obligatoire) ────────────────────────
  console.log('[OdooSign] C — create sign.document attachment_id:', attId)
  const signDocId = await execute('sign.document', 'create', [{
    name: filename, template_id: templateId, attachment_id: attId,
  }])
  const docRead = await execute('sign.document', 'read', [[signDocId]], {
    fields: ['id', 'name', 'template_id', 'attachment_id', 'num_pages'],
  })
  console.log('[OdooSign] C — sign.document relu:', JSON.stringify(docRead[0]))
  if (!docRead[0]?.attachment_id) throw new Error('sign.document créé sans attachment_id')

  // ── D : Rôles (find or create) ───────────────────────────────────────────
  const ROLE_NAMES = { MOE: 'MOE', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
  const existingRoles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'] })
  console.log('[OdooSign] D — rôles existants:', existingRoles.map(r => `${r.id}:${r.name}`).join(', '))

  const roleIds = {}
  for (const [key, label] of Object.entries(ROLE_NAMES)) {
    const found = existingRoles.find(r => r.name.toLowerCase() === label.toLowerCase())
    if (found) {
      roleIds[key] = found.id
    } else {
      try {
        roleIds[key] = await execute('sign.item.role', 'create', [{ name: label }])
        console.log('[OdooSign] D — créé rôle', label, '→', roleIds[key])
      } catch (e) {
        // Utiliser le premier rôle disponible en fallback
        roleIds[key] = existingRoles[0]?.id
        console.warn('[OdooSign] D — fallback rôle pour', key, ':', existingRoles[0]?.name)
      }
    }
  }
  console.log('[OdooSign] D — roleIds:', JSON.stringify(roleIds))

  // ── E : sign.item.type ───────────────────────────────────────────────────
  const signTypes = await execute('sign.item.type', 'search_read', [[]], { fields: ['id', 'name'], limit: 5 })
  console.log('[OdooSign] E — types:', signTypes.map(t => `${t.id}:${t.name}`).join(', '))
  const signTypeId = signTypes[0]?.id

  // ── E : sign.item — 3 zones de signature côte à côte ────────────────────
  const zones = [
    { role: 'MOE',        posX: 0.03, posY: 0.82 },
    { role: 'MOA',        posX: 0.37, posY: 0.82 },
    { role: 'Entreprise', posX: 0.68, posY: 0.82 },
  ]
  if (signTypeId) {
    for (const zone of zones) {
      if (!roleIds[zone.role]) continue
      const itemPayload = {
        template_id: templateId,
        responsible_id: roleIds[zone.role],
        required: true, type_id: signTypeId,
        posX: zone.posX, posY: zone.posY, width: 0.28, height: 0.12, page: 1,
      }
      try {
        const itemId = await execute('sign.item', 'create', [itemPayload])
        console.log('[OdooSign] E — sign.item', zone.role, '→', itemId)
      } catch (e) {
        console.warn('[OdooSign] E — sign.item', zone.role, 'échoué:', e.message)
      }
    }
  }

  // ── F : Partenaires Odoo ─────────────────────────────────────────────────
  const requestItems = []
  for (const s of signers) {
    if (!s.email) { console.warn('[OdooSign] F — pas d\'email pour', s.role); continue }
    const partnerId = await findOrCreatePartner({ name: s.name, email: s.email })
    const roleId = roleIds[s.role] || roleIds.Entreprise
    console.log('[OdooSign] F — signer', s.role, s.email, 'partnerId:', partnerId, 'roleId:', roleId)
    requestItems.push([0, 0, { partner_id: partnerId, role_id: roleId }])
  }
  if (!requestItems.length) throw new Error('Aucun signataire valide (vérifiez les emails)')

  // ── G : sign.request (créer sans état pour pouvoir définir l'objet) ──────
  const reqBase = { template_id: templateId, reference: reference || '', request_item_ids: requestItems }
  console.log('[OdooSign] G — create sign.request', JSON.stringify(reqBase))
  let requestId = await execute('sign.request', 'create', [reqBase])
  console.log('[OdooSign] G — sign.request id:', requestId)

  // ── H : Objet email + expéditeur avant envoi ─────────────────────────────
  const emailUpdates = { subject }
  try {
    await execute('sign.request', 'write', [[requestId], {
      ...emailUpdates,
      email_from: `Id Maîtrise <${ODOO_USER}>`,
      reply_to: `Id Maîtrise <${ODOO_USER}>`,
    }])
    console.log('[OdooSign] H — subject + email_from définis')
  } catch (_) {
    // subject seul
    try { await execute('sign.request', 'write', [[requestId], emailUpdates]); console.log('[OdooSign] H — subject seul défini') }
    catch (e) { console.warn('[OdooSign] H — champ subject non supporté:', e.message) }
  }

  // ── I : Envoi (state=sent ou méthode) ────────────────────────────────────
  let sent = false
  for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send']) {
    try { await execute('sign.request', m, [[requestId]]); sent = true; console.log('[OdooSign] I — envoyé via', m); break } catch (_) {}
  }
  if (!sent) {
    try { await execute('sign.request', 'write', [[requestId], { state: 'sent' }]); console.log('[OdooSign] I — state=sent') }
    catch (e) { console.warn('[OdooSign] I — write state:', e.message) }
  }

  console.log('[OdooSign] OK — requestId:', requestId, 'subject:', subject)
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
