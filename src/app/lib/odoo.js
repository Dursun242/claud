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
const ODOO_SIGN_TEMPLATE_REF = parseInt(process.env.ODOO_SIGN_TEMPLATE_REF || '0')

// Associe un nom de rôle Odoo à notre clé interne (MOE / MOA / Entreprise)
function roleNameToKey(name = '') {
  const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (n.includes('moe') || n.includes('maitrise')) return 'MOE'
  if (n.includes('maitre') || n.includes('ouvrage') || n.includes('moa')) return 'MOA'
  if (n.includes('entreprise') || n.includes('artisan')) return 'Entreprise'
  return null
}

export async function createSignRequestFromPdf({ pdfBase64, reference, operationName, signers }) {
  const b64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
  const filename = `${reference || 'OS'}.pdf`
  const subject = operationName
    ? `Signature requise – OS ${reference} – ${operationName}`
    : `Signature requise – OS ${reference}`

  // Validation stricte : 3 signataires obligatoires
  const ROLE_LABELS = { MOE: 'MOE (Id Maîtrise)', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
  for (const role of ['MOE', 'MOA', 'Entreprise']) {
    const s = signers?.find(x => x.role === role)
    if (!s?.email) throw new Error(`Email obligatoire pour le rôle ${ROLE_LABELS[role]}`)
  }
  if (signers.length !== 3) throw new Error(`3 signataires requis, ${signers.length} fourni(s)`)

  // ── REF : Lire le template de référence Odoo (rôles + positions) ─────────
  let refItems = []
  if (ODOO_SIGN_TEMPLATE_REF) {
    refItems = await execute('sign.item', 'search_read',
      [[['template_id', '=', ODOO_SIGN_TEMPLATE_REF]]],
      { fields: ['responsible_id', 'type_id', 'posX', 'posY', 'width', 'height', 'page', 'required'] }
    )
    console.log('[OdooSign] REF — template', ODOO_SIGN_TEMPLATE_REF, '→', refItems.length, 'items')
  }

  // Mapping clé interne → role ID Odoo (lu depuis le template de référence)
  const roleIds = {}                    // { MOE: id, MOA: id, Entreprise: id }
  const roleItemPayloads = []           // sign.item payloads à créer sur le nouveau template
  if (refItems.length) {
    for (const ref of refItems) {
      const rId  = ref.responsible_id?.[0]
      const rName = ref.responsible_id?.[1] || ''
      const key  = roleNameToKey(rName)
      if (rId && key) {
        roleIds[key] = rId
        roleItemPayloads.push({
          responsible_id: rId,
          type_id:        ref.type_id?.[0],
          posX: ref.posX, posY: ref.posY,
          width: ref.width, height: ref.height,
          page: ref.page ?? 1,
          required: ref.required ?? true,
        })
      }
    }
    console.log('[OdooSign] REF — roleIds depuis template:', JSON.stringify(roleIds))
  } else {
    // Fallback : find-or-create les rôles par nom
    const allRoles = await execute('sign.item.role', 'search_read', [[]], { fields: ['id', 'name'] })
    const ROLE_NAMES = { MOE: 'moe', MOA: 'maître', Entreprise: 'entreprise' }
    for (const [key, fragment] of Object.entries(ROLE_NAMES)) {
      const found = allRoles.find(r => r.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(fragment))
      if (found) {
        roleIds[key] = found.id
      } else {
        const labels = { MOE: 'MOE', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
        try { roleIds[key] = await execute('sign.item.role', 'create', [{ name: labels[key] }]) }
        catch (e) { roleIds[key] = allRoles[0]?.id; console.warn('[OdooSign] fallback rôle:', key) }
      }
    }
    // Zones par défaut si pas de template de référence
    const signTypes = await execute('sign.item.type', 'search_read', [[]], { fields: ['id'], limit: 1 })
    const tId = signTypes[0]?.id
    if (tId) {
      const DEFAULT_ZONES = [
        { key: 'MOE',        posX: 0.03, posY: 0.82 },
        { key: 'MOA',        posX: 0.37, posY: 0.82 },
        { key: 'Entreprise', posX: 0.68, posY: 0.82 },
      ]
      for (const z of DEFAULT_ZONES) {
        if (roleIds[z.key]) roleItemPayloads.push({ responsible_id: roleIds[z.key], type_id: tId, posX: z.posX, posY: z.posY, width: 0.28, height: 0.12, page: 1, required: true })
      }
    }
    console.log('[OdooSign] fallback — roleIds:', JSON.stringify(roleIds))
  }

  // ── A : ir.attachment ────────────────────────────────────────────────────
  const attId = await execute('ir.attachment', 'create', [{
    name: filename, type: 'binary', datas: b64, mimetype: 'application/pdf',
  }])
  console.log('[OdooSign] A — attId:', attId)

  // ── B : sign.template ────────────────────────────────────────────────────
  const templateId = await execute('sign.template', 'create', [{ name: filename }])
  console.log('[OdooSign] B — templateId:', templateId)

  // ── C : sign.document ────────────────────────────────────────────────────
  const signDocId = await execute('sign.document', 'create', [{
    name: filename, template_id: templateId, attachment_id: attId,
  }])
  const docRead = await execute('sign.document', 'read', [[signDocId]], { fields: ['id', 'attachment_id'] })
  if (!docRead[0]?.attachment_id) throw new Error('sign.document créé sans attachment_id')
  console.log('[OdooSign] C — signDocId:', signDocId)

  // ── E : sign.items (structure du template de référence) ──────────────────
  for (const payload of roleItemPayloads) {
    try {
      const iId = await execute('sign.item', 'create', [{ template_id: templateId, ...payload }])
      console.log('[OdooSign] E — sign.item créé:', iId)
    } catch (e) {
      console.warn('[OdooSign] E — sign.item échec:', e.message)
    }
  }

  // Lire les rôles réels créés sur le template (source de vérité pour sign.request)
  const templateItems = await execute('sign.item', 'search_read',
    [[['template_id', '=', templateId]]], { fields: ['responsible_id'] }
  )
  const requiredRoleIds = [...new Set(templateItems.map(i => i.responsible_id?.[0]).filter(Boolean))]
  console.log('[OdooSign] E — rôles requis sur template:', requiredRoleIds)

  // ── F : Partenaires ──────────────────────────────────────────────────────
  const roleToPartner = {}
  for (const s of signers) {
    if (!s.email || !roleIds[s.role]) continue
    const partnerId = await findOrCreatePartner({ name: s.name, email: s.email })
    roleToPartner[roleIds[s.role]] = partnerId
    console.log('[OdooSign] F —', s.role, s.email, '→ partner', partnerId)
  }

  // ── G : request_items couvrant EXACTEMENT les rôles du template ───────────
  const fallbackPartnerId = Object.values(roleToPartner)[0]
  const requestItems = (requiredRoleIds.length > 0 ? requiredRoleIds : Object.keys(roleToPartner).map(Number))
    .map(rId => {
      const partnerId = roleToPartner[rId] ?? fallbackPartnerId
      return partnerId ? [0, 0, { partner_id: partnerId, role_id: rId }] : null
    })
    .filter(Boolean)

  if (!requestItems.length) throw new Error('Aucun request_item — vérifiez les emails et rôles')
  console.log('[OdooSign] G — requestItems:', requestItems.length)

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
