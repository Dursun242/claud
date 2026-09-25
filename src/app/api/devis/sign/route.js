// Route /api/devis/sign — signature électronique d'un devis (Odoo Sign).
//
// Réservée au staff (verifyStaff). Deux actions :
//   - "send" : envoie le PDF Qonto du devis à Odoo Sign, avec une zone de
//              signature « Client » en bas à droite de la dernière page.
//              Odoo envoie au client l'e-mail contenant le lien de signature.
//   - "sync" : relit auprès d'Odoo le statut des signatures en attente.
//              Signé → devis « Accepté », refusé → « Refusé ».
//
// Le PDF est celui vérifié dans la fenêtre d'envoi (PDF Qonto) ; il est
// contrôlé ici (%PDF, taille) avant d'être transmis à Odoo.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { createSignRequestFromPdf, getSignRequestsStatusBulk, countPdfPages } from '@/app/lib/odoo'
import { parseEmails } from '@/app/lib/devisAi'

export const maxDuration = 60

const log = createLogger('devis-sign')
const checkRate = createRateLimiter({ limit: 20, windowMs: 60_000 })

const FINAL = ['Signé', 'Refusé', 'Expiré', 'Annulé']
// Zone « bon pour accord » : bas de page, à droite
const PLACEMENT = { posX: 0.62, posY: 0.70 }
const MAX_PDF_BYTES = 8 * 1024 * 1024

const fail = (error, status, code = null) => Response.json({ error, code }, { status })

async function send(admin, body) {
  const { devisId, signerName } = body
  if (!devisId || typeof devisId !== 'string') return fail('Devis manquant', 400)
  const email = parseEmails(body.signerEmail)
  if (email.list.length !== 1 || email.invalid.length) return fail('Adresse e-mail du signataire invalide', 400)

  const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;[^,]*,/, '')
  const pdf = Buffer.from(b64, 'base64')
  if (!b64 || pdf.subarray(0, 4).toString() !== '%PDF') return fail('PDF invalide', 400)
  if (pdf.length > MAX_PDF_BYTES) return fail('PDF trop volumineux', 400)

  const { data: devis, error } = await admin.from('crm_devis').select('*').eq('id', devisId).maybeSingle()
  if (error) return fail('Lecture du devis impossible : ' + error.message, 500)
  if (!devis) return fail('Devis introuvable', 404)
  if (!('odoo_sign_id' in devis)) {
    return fail('Appliquer la migration 029_crm_devis_signature.sql sur Supabase pour la signature électronique.', 409, 'MIGRATION_029')
  }

  const result = await createSignRequestFromPdf({
    pdfBase64: b64,
    reference: `Devis ${devis.numero}`,
    operationName: devis.objet || '',
    signers: [{ name: String(signerName || email.list[0]).slice(0, 200), email: email.list[0], role: 'Client' }],
    placement: { ...PLACEMENT, page: countPdfPages(b64) },
  })

  const { data: saved, error: upErr } = await admin.from('crm_devis')
    .update({ odoo_sign_id: result.requestId, odoo_sign_url: result.signUrl, statut_signature: 'Envoyé' })
    .eq('id', devis.id).select().single()
  if (upErr) log.warn('lien signature non enregistré', upErr.message)
  return Response.json({ ok: true, data: { requestId: result.requestId, devis: saved || devis } })
}

async function sync(admin) {
  const { data: rows, error } = await admin.from('crm_devis')
    .select('id, numero, statut, opportunite_id, total_ht, odoo_sign_id, statut_signature')
    .not('odoo_sign_id', 'is', null)
  if (error) {
    // Migration 029 absente : rien à synchroniser
    if (/odoo_sign_id|column/i.test(error.message || '')) return Response.json({ ok: true, data: { changes: [] } })
    return fail('Lecture des devis impossible : ' + error.message, 500)
  }
  const pending = (rows || []).filter(r => !FINAL.includes(r.statut_signature))
  if (!pending.length) return Response.json({ ok: true, data: { changes: [] } })

  const statuses = await getSignRequestsStatusBulk(pending.map(r => r.odoo_sign_id))
  const byId = new Map(statuses.map(s => [s.requestId, s]))
  const today = new Date().toISOString().slice(0, 10)
  const changes = []
  for (const d of pending) {
    const s = byId.get(d.odoo_sign_id)
    if (!s || s.statut_signature === d.statut_signature) continue
    const patch = { statut_signature: s.statut_signature }
    if (s.statut_signature === 'Signé' && d.statut !== 'Accepté') Object.assign(patch, { statut: 'Accepté', date_reponse: today })
    if (s.statut_signature === 'Refusé' && d.statut !== 'Accepté') Object.assign(patch, { statut: 'Refusé', date_reponse: today })
    const { error: upErr } = await admin.from('crm_devis').update(patch).eq('id', d.id)
    if (upErr) { log.warn(`maj ${d.numero}`, upErr.message); continue }
    changes.push({ id: d.id, numero: d.numero, opportunite_id: d.opportunite_id, total_ht: d.total_ht, statut_signature: s.statut_signature })
  }
  return Response.json({ ok: true, data: { changes } })
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) return fail('Trop de requêtes — attendez 1 minute.', 429)
    const { user, status } = await verifyStaff(request)
    if (!user) return fail(status === 403 ? 'Réservé à l’équipe' : 'Non autorisé', status)

    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    if (body.action === 'send') return await send(admin, body)
    if (body.action === 'sync') return await sync(admin)
    return fail('Action inconnue', 400)
  } catch (err) {
    log.error('exception', err?.message || err)
    return fail(`Signature électronique impossible : ${err?.message || 'erreur Odoo'}`, 502)
  }
}
