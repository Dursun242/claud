// Route /api/devis/sign — signature électronique intégrée d'un devis.
//
// Réservée au staff (verifyStaff). Actions :
//   - "send"       : conserve le PDF Qonto vérifié dans la fenêtre d'envoi
//                    (bucket privé attachments, devis-signature/<id>/) et crée
//                    un jeton de signature. Le front ajoute le lien
//                    /signer/<jeton> au mail envoyé au client.
//   - "signed-pdf" : renvoie le PDF signé (base64).
//
// La signature elle-même se fait sur la page publique /signer/<jeton>
// (route /api/devis/public), sans compte, sans service tiers.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { newSignToken, sha256 } from '@/app/lib/devisSignature'
import { parseEmails } from '@/app/lib/devisAi'

export const maxDuration = 30

const log = createLogger('devis-sign')
const checkRate = createRateLimiter({ limit: 20, windowMs: 60_000 })
const BUCKET = 'attachments'
const MAX_PDF_BYTES = 8 * 1024 * 1024

const fail = (error, status, code = null) => Response.json({ error, code }, { status })

async function loadDevis(admin, devisId) {
  if (!devisId || typeof devisId !== 'string') return { res: fail('Devis manquant', 400) }
  const { data: devis, error } = await admin.from('crm_devis').select('*').eq('id', devisId).maybeSingle()
  if (error) return { res: fail('Lecture du devis impossible : ' + error.message, 500) }
  if (!devis) return { res: fail('Devis introuvable', 404) }
  if (!('sign_token' in devis)) {
    return { res: fail('Appliquer la migration 029_crm_devis_signature.sql sur Supabase pour la signature électronique.', 409, 'MIGRATION_029') }
  }
  return { devis }
}

async function send(admin, body) {
  const email = parseEmails(body.signerEmail)
  if (email.list.length !== 1 || email.invalid.length) return fail('Adresse e-mail du signataire invalide', 400)
  const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;[^,]*,/, '')
  const pdf = Buffer.from(b64, 'base64')
  if (!b64 || pdf.subarray(0, 4).toString() !== '%PDF') return fail('PDF invalide', 400)
  if (pdf.length > MAX_PDF_BYTES) return fail('PDF trop volumineux', 400)

  const { devis, res } = await loadDevis(admin, body.devisId)
  if (res) return res
  if (devis.statut_signature === 'Signé') return fail('Ce devis est déjà signé.', 409, 'ALREADY_SIGNED')

  const token = newSignToken()
  const path = `devis-signature/${devis.id}/original-${Date.now()}.pdf`
  const up = await admin.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
  if (up.error) return fail('Stockage du PDF impossible : ' + up.error.message, 500)

  const { error } = await admin.from('crm_devis').update({
    sign_token: token,
    sign_email: email.list[0],
    sign_requested_at: new Date().toISOString(),
    sign_pdf_path: path,
    sign_pdf_sha256: sha256(pdf),
    statut_signature: 'Envoyé',
    signed_at: null, signed_name: null, signed_ip: null, signed_user_agent: null, signed_pdf_path: null,
  }).eq('id', devis.id)
  if (error) return fail('Enregistrement de la demande impossible : ' + error.message, 500)
  return Response.json({ ok: true, data: { token } })
}

async function signedPdf(admin, body) {
  const { devis, res } = await loadDevis(admin, body.devisId)
  if (res) return res
  if (devis.statut_signature !== 'Signé' || !devis.signed_pdf_path) return fail('Devis pas encore signé', 404)
  const { data, error } = await admin.storage.from(BUCKET).download(devis.signed_pdf_path)
  if (error || !data) return fail('PDF signé introuvable', 404)
  const buf = Buffer.from(await data.arrayBuffer())
  return Response.json({ ok: true, data: { base64: buf.toString('base64'), filename: `Devis ${devis.numero} signé.pdf` } })
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
    if (body.action === 'signed-pdf') return await signedPdf(admin, body)
    return fail('Action inconnue', 400)
  } catch (err) {
    log.error('exception', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
