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

  // 3. Créer la demande de signature
  const requestId = await execute('sign.request', 'create', [{
    template_id: templateId,
    reference: reference || '',
    request_item_ids: [[0, 0, {
      partner_id: partnerId,
      role_id: roleId,
    }]],
  }])

  // 4. Envoyer la demande — essaie plusieurs noms de méthode selon la version Odoo
  const sendMethods = ['action_send_request', 'send_signature_accesses', 'action_validate']
  let sent = false
  for (const method of sendMethods) {
    try {
      await execute('sign.request', method, [[requestId]])
      sent = true
      break
    } catch (_) { /* essai suivant */ }
  }
  // Si aucune méthode ne fonctionne, forcer l'état "sent" directement
  if (!sent) {
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
 * Crée une demande de signature depuis un PDF base64 (l'OS généré par l'app)
 * @param {Object} params
 * @param {string} params.pdfBase64 - dataURI base64 du PDF (output de jsPDF)
 * @param {string} params.signerName
 * @param {string} params.signerEmail
 * @param {string} params.reference - Numéro OS
 */
export async function createSignRequestFromPdf({ pdfBase64, signerName, signerEmail, reference }) {
  const partnerId = await findOrCreatePartner({ name: signerName, email: signerEmail })

  // Extraire le base64 pur (sans le préfixe data:application/pdf;base64,)
  const b64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64

  // 1. Créer le template Sign
  // On essaie plusieurs approches selon la version Odoo
  let templateId
  let lastError = ''

  // Approche A : _inherits direct (Odoo 17)
  try {
    templateId = await execute('sign.template', 'create', [{
      name: `${reference || 'OS'}.pdf`,
      datas: b64,
      mimetype: 'application/pdf',
    }])
  } catch (e1) {
    lastError = e1.message
    // Approche B : attachment séparé puis liaison
    let attachmentId
    try {
      attachmentId = await execute('ir.attachment', 'create', [{
        name: `${reference || 'OS'}.pdf`,
        type: 'binary',
        datas: b64,
        mimetype: 'application/pdf',
      }])
    } catch (eA) { throw new Error(`Erreur création attachment Odoo : ${eA.message}`) }

    for (const field of ['attachment_id', 'ir_attachment_id', 'signed_document']) {
      try {
        const data = { name: reference || 'OS' }
        data[field] = attachmentId
        templateId = await execute('sign.template', 'create', [data])
        lastError = ''
        break
      } catch (e2) { lastError = `[${field}] ${e2.message}` }
    }
    if (!templateId) throw new Error(`Odoo Sign : impossible de créer le template. Dernière erreur : ${lastError}`)
  }

  // 3. Récupérer le rôle de signataire par défaut
  const roles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'], limit: 1 })
  const roleId = roles[0]?.id
  if (!roleId) throw new Error('Aucun rôle signataire trouvé dans Odoo Sign')

  // 4. Ajouter une zone de signature en bas à droite de la page 1
  await execute('sign.item', 'create', [{
    template_id: templateId,
    type_id: (await execute('sign.item.type', 'search_read', [[['item_type', '=', 'signature']]], { fields: ['id'], limit: 1 }))[0]?.id || 1,
    required: true,
    page: 1,
    posX: 0.55,
    posY: 0.88,
    width: 0.35,
    height: 0.08,
    responsible_id: roleId,
  }])

  // 5. Créer la demande de signature
  const requestId = await execute('sign.request', 'create', [{
    template_id: templateId,
    reference: reference || '',
    request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
  }])

  // 6. Envoyer (essai multi-méthodes)
  const sendMethods = ['action_send_request', 'send_signature_accesses', 'action_validate']
  let sent = false
  for (const method of sendMethods) {
    try { await execute('sign.request', method, [[requestId]]); sent = true; break } catch (_) {}
  }
  if (!sent) {
    await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
  }

  const signUrl = `${ODOO_URL}/odoo/sign/${requestId}`
  return { requestId, signUrl, state: 'sent' }
}

/** Vérifie le statut d'une demande de signature */
export async function getSignRequestStatus(requestId) {
  const data = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference'],
  })
  if (!data.length) throw new Error('Demande de signature introuvable')
  return data[0]
}
