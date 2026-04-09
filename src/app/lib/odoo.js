/**
 * Service Odoo JSON-RPC
 * Utilisé côté serveur uniquement (routes API Next.js)
 */

const ODOO_URL     = process.env.ODOO_URL
const ODOO_DB      = process.env.ODOO_DB
const ODOO_USER    = process.env.ODOO_USER
const ODOO_API_KEY = process.env.ODOO_API_KEY

// ID du template Odoo Sign de référence (ex : 43)
// Ce template doit avoir 3 zones de signature configurées : MOE / Maître d'ouvrage / Entreprise
const ODOO_SIGN_TEMPLATE_REF = parseInt(process.env.ODOO_SIGN_TEMPLATE_REF || '0')

async function jsonrpc(service, method, args) {
  if (!ODOO_URL) throw new Error('Variable ODOO_URL manquante dans Vercel')
  let res
  try {
    res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'User-Agent':   'Mozilla/5.0 ID-Maitrise/1.0',
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
export async function testConnection() {
  const version = await jsonrpc('common', 'version', [])
  const uid = await getUid()
  return { ok: true, version: version.server_version, uid }
}

/** Inspecte les champs d'un modèle Odoo (diagnostic) */
export async function inspectModel(model) {
  return execute(model, 'fields_get', [], { attributes: ['string', 'type', 'readonly', 'required'] })
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
  const items = await execute('sign.item', 'search_read', [[['template_id', '=', templateId]]], {
    fields: ['id', 'responsible_id'],
  })
  const roleIds = [...new Set(items.map(i => i.responsible_id?.[0]).filter(Boolean))]
  if (!roleIds.length) {
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
 * Crée et envoie une demande de signature Odoo (flux 1 signataire — ancien)
 */
export async function createSignRequest({ templateId, signerName, signerEmail, reference }) {
  const partnerId = await findOrCreatePartner({ name: signerName, email: signerEmail })
  const roles = await getTemplateRoles(templateId)
  if (!roles.length) throw new Error('Aucun rôle de signataire trouvé dans ce template')
  const roleId = roles[0].id

  let requestId
  try {
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId,
      reference: reference || '',
      state: 'sent',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
  } catch (_) {
    requestId = await execute('sign.request', 'create', [{
      template_id: templateId,
      reference: reference || '',
      request_item_ids: [[0, 0, { partner_id: partnerId, role_id: roleId }]],
    }])
    for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send', 'action_validate']) {
      try { await execute('sign.request', m, [[requestId]]); break } catch (_) {}
    }
    await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
  }

  const requestData = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'reference', 'state', 'request_item_ids'],
  })
  return { requestId, signUrl: `${ODOO_URL}/odoo/sign/${requestId}`, state: requestData[0]?.state || 'sent' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flux 3 signataires — flux principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mappe un nom de rôle Odoo vers la clé interne : 'MOE' | 'MOA' | 'Entreprise'
 * Les noms dans Odoo peuvent être "MOE", "Maître d'œuvre", "Maître d'ouvrage", "Entreprise"...
 */
function roleNameToKey(name = '') {
  const n = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  if (n.includes('moe') || n.includes('uvre') || n.includes('maitrise')) return 'MOE'
  if (n.includes('ouvrage') || n.includes('moa'))                        return 'MOA'
  if (n.includes('entreprise') || n.includes('artisan'))                 return 'Entreprise'
  return null
}

/**
 * Crée et envoie une demande de signature Odoo Sign depuis un PDF base64.
 *
 * Architecture :
 *   1. Upload ir.attachment (le PDF de l'OS)
 *   2. copy() du template de référence (préserve sign.items + rôles)
 *   3. Remplace le PDF sur le template copié
 *   4. Lit les sign.items → roleIds (source de vérité)
 *   5. Crée/trouve les partenaires Odoo pour chaque signataire
 *   6. Crée sign.request avec request_item_ids couvrant EXACTEMENT les 3 rôles
 *   7. Définit subject + email_from
 *   8. Envoie via send_signature_accesses (avec logs explicites des erreurs)
 *
 * @param {string} params.pdfBase64     - PDF de l'OS (dataURI ou base64 brut)
 * @param {string} params.reference     - Numéro OS, ex : "OS-2026-020"
 * @param {string} params.operationName - Nom du chantier (pour l'objet email)
 * @param {Array}  params.signers       - [{name, email, role}] role ∈ 'MOE'|'MOA'|'Entreprise'
 */
export async function createSignRequestFromPdf({ pdfBase64, reference, operationName, signers }) {
  const b64      = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
  const filename = `${reference || 'OS'}.pdf`
  const subject  = operationName
    ? `Signature requise – OS ${reference} – ${operationName}`
    : `Signature requise – OS ${reference}`

  // ── Validation stricte ──────────────────────────────────────────────────────
  const ROLE_LABELS = { MOE: 'MOE (Id Maîtrise)', MOA: "Maître d'ouvrage", Entreprise: 'Entreprise' }
  for (const role of ['MOE', 'MOA', 'Entreprise']) {
    const s = signers?.find(x => x.role === role)
    if (!s?.email) throw new Error(`Email obligatoire pour le rôle ${ROLE_LABELS[role]}`)
  }
  if (signers.length !== 3) throw new Error(`3 signataires requis, ${signers.length} fourni(s)`)
  if (!ODOO_SIGN_TEMPLATE_REF) {
    throw new Error('Variable ODOO_SIGN_TEMPLATE_REF manquante — ajoutez ODOO_SIGN_TEMPLATE_REF=43 dans Vercel')
  }

  // ── 1 : Upload le PDF de l'OS ───────────────────────────────────────────────
  const attId = await execute('ir.attachment', 'create', [{
    name: filename, type: 'binary', datas: b64, mimetype: 'application/pdf',
  }])
  console.log('[OdooSign] 1 — ir.attachment créé:', attId)

  // ── 2 : Dupliquer le template de référence ──────────────────────────────────
  // copy() duplique le template ET ses sign.items (zones + rôles) automatiquement.
  // On passe notre nouveau attachment_id dans les valeurs par défaut.
  // Si attachment_id n'est pas un champ valide sur sign.template, on copie sans
  // puis on met à jour l'attachment séparément (voir étape 3).
  let newTemplateId
  try {
    newTemplateId = await execute('sign.template', 'copy', [ODOO_SIGN_TEMPLATE_REF], {
      default: { name: filename, attachment_id: attId },
    })
    console.log('[OdooSign] 2 — template copié avec attachment_id:', newTemplateId)
  } catch (e1) {
    console.warn('[OdooSign] 2 — copy avec attachment_id échoué:', e1.message, '— retry sans')
    try {
      newTemplateId = await execute('sign.template', 'copy', [ODOO_SIGN_TEMPLATE_REF], {
        default: { name: filename },
      })
      console.log('[OdooSign] 2 — template copié (sans attachment_id):', newTemplateId)
    } catch (e2) {
      throw new Error(`Impossible de copier le template ${ODOO_SIGN_TEMPLATE_REF} : ${e2.message}`)
    }
  }

  // ── 3 : Assurer que le PDF de l'OS est bien lié au template copié ───────────
  // Le copy() a peut-être hérité de l'attachment du template original.
  // On s'assure que le template copié pointe sur Notre nouveau PDF.
  let pdfLinked = false

  // Essai A : attachment_id direct sur sign.template
  try {
    const tmplData = await execute('sign.template', 'read', [[newTemplateId]], { fields: ['id', 'attachment_id'] })
    const currentAttId = tmplData[0]?.attachment_id?.[0]
    if (currentAttId === attId) {
      // Déjà lié (le copy() avec default a fonctionné)
      pdfLinked = true
      console.log('[OdooSign] 3A — attachment_id déjà correct:', attId)
    } else {
      // Mettre à jour l'attachment_id sur le template copié
      await execute('sign.template', 'write', [[newTemplateId], { attachment_id: attId }])
      pdfLinked = true
      console.log('[OdooSign] 3A — attachment_id mis à jour:', currentAttId, '→', attId)
    }
  } catch (eA) {
    console.warn('[OdooSign] 3A — attachment_id non disponible sur sign.template:', eA.message)

    // Essai B : mettre à jour le contenu de l'attachment copié (via sign.document)
    try {
      const docs = await execute('sign.document', 'search_read',
        [[['template_id', '=', newTemplateId]]],
        { fields: ['id', 'attachment_id'], limit: 1 }
      )
      if (docs.length && docs[0].attachment_id?.[0]) {
        // Écraser le contenu de l'attachment copié avec notre nouveau PDF
        await execute('ir.attachment', 'write', [[docs[0].attachment_id[0]], { datas: b64, name: filename }])
        pdfLinked = true
        console.log('[OdooSign] 3B — ir.attachment mis à jour via sign.document:', docs[0].attachment_id[0])
      } else {
        // Créer un sign.document avec notre attachment
        await execute('sign.document', 'create', [{
          name: filename, template_id: newTemplateId, attachment_id: attId,
        }])
        pdfLinked = true
        console.log('[OdooSign] 3B — sign.document créé avec attachment')
      }
    } catch (eB) {
      console.error('[OdooSign] 3B — mise à jour PDF échouée:', eB.message)
      // On continue : le template de référence sera affiché à la place du PDF de l'OS
    }
  }

  if (!pdfLinked) {
    console.warn('[OdooSign] 3 — PDF non lié au template. Le document signé affichera le PDF du template de référence.')
  }

  // ── 4 : Lire les sign.items du template copié (source de vérité pour les rôles) ──
  const templateItems = await execute('sign.item', 'search_read',
    [[['template_id', '=', newTemplateId]]],
    { fields: ['id', 'responsible_id'] }
  )
  console.log('[OdooSign] 4 —', templateItems.length, 'sign.item(s) sur le template copié')

  if (!templateItems.length) {
    throw new Error(
      `Le template de référence (id:${ODOO_SIGN_TEMPLATE_REF}) n'a aucune zone de signature (sign.item). ` +
      `Ouvrez Odoo Sign > Modèles > id:${ODOO_SIGN_TEMPLATE_REF} et configurez les 3 zones.`
    )
  }

  // Construire le mapping clé interne → role_id Odoo
  const roleIds = {}
  for (const item of templateItems) {
    const rId  = item.responsible_id?.[0]
    const key  = roleNameToKey(item.responsible_id?.[1] || '')
    if (rId && key && !roleIds[key]) roleIds[key] = rId
  }
  console.log('[OdooSign] 4 — roleIds mappés:', JSON.stringify(roleIds))

  // Vérifier que les 3 rôles sont reconnus
  for (const role of ['MOE', 'MOA', 'Entreprise']) {
    if (!roleIds[role]) {
      const found = templateItems.map(i => `"${i.responsible_id?.[1]}" (id:${i.responsible_id?.[0]})`).join(', ')
      throw new Error(
        `Rôle "${role}" non reconnu dans le template ${ODOO_SIGN_TEMPLATE_REF}. ` +
        `Rôles trouvés : ${found}. ` +
        `Vérifiez que les noms de rôles contiennent : "moe"/"uvre" pour MOE, "ouvrage" pour MOA, "entreprise" pour Entreprise.`
      )
    }
  }

  // IDs uniques des rôles dans le template (dans l'ordre pour la correspondance exacte)
  const uniqueRoleIds = [...new Set(templateItems.map(i => i.responsible_id?.[0]).filter(Boolean))]

  // ── 5 : Créer/trouver les partenaires Odoo pour chaque signataire ───────────
  const roleToPartner = {}
  for (const s of signers) {
    const rId = roleIds[s.role]
    const partnerId = await findOrCreatePartner({ name: s.name, email: s.email })
    roleToPartner[rId] = partnerId
    console.log('[OdooSign] 5 —', s.role, '→ partner', partnerId, '(', s.email, ')')
  }

  // ── 6 : Créer sign.request ──────────────────────────────────────────────────
  // request_item_ids doit couvrir EXACTEMENT les mêmes rôles que les sign.items du template.
  // Odoo valide que template_roles == signer_roles (dans les deux sens).
  const requestItems = uniqueRoleIds.map(rId => {
    const pId = roleToPartner[rId]
    if (!pId) throw new Error(`Partenaire manquant pour role_id ${rId} — vérifiez le mapping signers`)
    return [0, 0, { partner_id: pId, role_id: rId }]
  })
  console.log('[OdooSign] 6 — requestItems:', requestItems.length)

  const requestId = await execute('sign.request', 'create', [{
    template_id:      newTemplateId,
    reference:        reference || '',
    request_item_ids: requestItems,
  }])
  console.log('[OdooSign] 6 — sign.request créé:', requestId)

  // ── 7 : Définir subject + email_from AVANT l'envoi ─────────────────────────
  try {
    await execute('sign.request', 'write', [[requestId], {
      subject,
      email_from: `Id Maîtrise <${ODOO_USER}>`,
      reply_to:   `Id Maîtrise <${ODOO_USER}>`,
    }])
    console.log('[OdooSign] 7 — subject défini:', subject)
  } catch (e) {
    console.warn('[OdooSign] 7 — write subject/email_from échoué:', e.message)
    try { await execute('sign.request', 'write', [[requestId], { subject }]) } catch (_) {}
  }

  // ── 8 : Envoyer la demande de signature ─────────────────────────────────────
  // Les erreurs sont LOGGÉES (pas ignorées) pour diagnostiquer si l'envoi échoue.
  const sendErrors = []
  let sent = false

  for (const m of ['action_send_request', 'send_signature_accesses', 'action_sign_send']) {
    try {
      await execute('sign.request', m, [[requestId]])
      sent = true
      console.log('[OdooSign] 8 — envoyé via', m)
      break
    } catch (e) {
      sendErrors.push(`${m}: ${e.message}`)
      console.warn('[OdooSign] 8 —', m, 'échoué:', e.message)
    }
  }

  // Fallback : forcer state=sent (certaines versions d'Odoo envoient les emails au changement d'état)
  if (!sent) {
    try {
      await execute('sign.request', 'write', [[requestId], { state: 'sent' }])
      sent = true
      console.log('[OdooSign] 8 — state=sent forcé (fallback)')
    } catch (e) {
      sendErrors.push(`write state=sent: ${e.message}`)
    }
  }

  if (!sent) {
    // La demande EST créée dans Odoo mais les emails ne sont pas partis.
    // On remonte l'erreur avec le détail pour corriger.
    throw new Error(
      `sign.request ${requestId} créé mais NON envoyé.\n` +
      `Erreurs :\n${sendErrors.join('\n')}\n` +
      `Vérifiez manuellement : ${ODOO_URL}/odoo/sign/${requestId}`
    )
  }

  // ── 9 : Vérifier l'état final ────────────────────────────────────────────────
  let finalState = 'sent'
  try {
    const stateData = await execute('sign.request', 'read', [[requestId]], { fields: ['id', 'state'] })
    finalState = stateData[0]?.state || 'sent'
  } catch (_) {}
  console.log('[OdooSign] DONE — requestId:', requestId, '| state:', finalState, '| subject:', subject)

  return {
    requestId,
    signUrl: `${ODOO_URL}/odoo/sign/${requestId}`,
    state:   finalState,
    subject,
  }
}

/** Vérifie le statut d'une demande de signature */
export async function getSignRequestStatus(requestId) {
  const data = await execute('sign.request', 'read', [[requestId]], {
    fields: ['id', 'state', 'reference'],
  })
  if (!data.length) throw new Error('Demande de signature introuvable')
  return data[0]
}
