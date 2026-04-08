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
 * Crée une demande de signature depuis un PDF base64 (l'OS généré par l'app)
 * @param {Object} params
 * @param {string} params.pdfBase64 - dataURI base64 du PDF (output de jsPDF)
 * @param {string} params.signerName
 * @param {string} params.signerEmail
 * @param {string} params.reference - Numéro OS
 */
export async function createSignRequestFromPdf({ pdfBase64, signerName, signerEmail, reference }) {
  const partnerId = await findOrCreatePartner({ name: signerName, email: signerEmail })
  const b64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64

  // Approche REST API Odoo 17 (Bearer token) — contourne les restrictions JSON-RPC
  const uid = await getUid()
  const credentials = Buffer.from(`${ODOO_USER}:${ODOO_API_KEY}`).toString('base64')

  // 1. Upload PDF via l'endpoint web session d'Odoo
  let attachmentId
  try {
    const uploadRes = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: {
          model: 'ir.attachment', method: 'create',
          args: [{ name: `${reference || 'OS'}.pdf`, type: 'binary', datas: b64, mimetype: 'application/pdf' }],
          kwargs: { context: { active_model: 'sign.template' } },
        },
      }),
    })
    const uploadJson = await uploadRes.json()
    if (uploadJson.error) throw new Error(uploadJson.error.data?.message || uploadJson.error.message)
    attachmentId = uploadJson.result
  } catch (e) {
    throw new Error(`Upload PDF Odoo : ${e.message}`)
  }

  // 2. Créer template via REST API Odoo 17
  let templateId
  try {
    const tplRes = await fetch(`${ODOO_URL}/api/sign.template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ODOO_API_KEY}`,
      },
      body: JSON.stringify({ attachment_id: attachmentId }),
    })
    if (tplRes.ok) {
      const tplJson = await tplRes.json()
      templateId = tplJson.id || tplJson
    }
  } catch (_) {}

  // 3. Fallback JSON-RPC si REST ne fonctionne pas
  if (!templateId) {
    try {
      templateId = await execute('sign.template', 'create', [{ attachment_id: attachmentId }])
    } catch (e) {
      throw new Error(`Création template Odoo Sign impossible. Erreur : ${e.message}. AttachmentId créé : ${attachmentId}`)
    }
  }

  // 4. Rôle signataire
  const roles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'], limit: 1 })
  const roleId = roles[0]?.id
  if (!roleId) throw new Error('Aucun rôle signataire trouvé dans Odoo Sign')

  // 5. Créer la demande de signature
  let requestId
  try {
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId, reference: reference || '', state: 'sent',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
  } catch (_) {
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId, reference: reference || '',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
    for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send']) {
      try { await execute('sign.request', m, [[requestId]]); break } catch (_) {}
    }
    await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
  }

  return { requestId, signUrl: `${ODOO_URL}/odoo/sign/${requestId}`, state: 'sent' }
}

/** Vérifie le statut d'une demande de signature */
export async function getSignRequestStatus(requestId) {
  const data = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference'],
  })
  if (!data.length) throw new Error('Demande de signature introuvable')
  return data[0]
}
