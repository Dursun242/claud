// Route /api/devis/public — page publique de signature d'un devis.
//
// SANS authentification : l'accès est donné par le jeton de signature
// (64 caractères hexadécimaux, 256 bits aléatoires) reçu par mail.
//   GET  ?token=…         → résumé du devis (numéro, objet, montants, statut)
//   GET  ?token=…&pdf=1   → PDF du devis (signé s'il l'est, sinon original)
//   POST { token, name, signature, accept } → signature du devis
//
// À la signature : la signature est apposée sur le PDF (preuves : date,
// IP, navigateur, empreinte SHA-256 du PDF d'origine), le devis passe
// « Accepté » et l'affaire « Gagné ». Le lien ne sert plus ensuite.

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { isSignToken, decodeSignaturePng, stampSignature, sha256 } from '@/app/lib/devisSignature'
import { notifyTeam, fmtEur } from '@/app/lib/devisNotify'
import { getQontoToken, pushQuoteStatus } from '@/app/lib/qontoServer'

export const maxDuration = 30

const log = createLogger('devis-public')
const checkRate = createRateLimiter({ limit: 30, windowMs: 60_000 })
const BUCKET = 'attachments'

const fail = (error, status) => Response.json({ error }, { status })
const clientIp = (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

async function findByToken(admin, token) {
  if (!isSignToken(token)) return null
  const { data } = await admin.from('crm_devis').select('*').eq('sign_token', token).maybeSingle()
  return data || null
}

const isExpired = (d) => !!d.date_validite && d.date_validite < todayParis()

/** Prévient l'équipe d'une signature (cloche + mail avec le PDF signé). */
function notifySigned(admin, devis, { name, signedAt, ip, signed, oppTitre }) {
  const quand = signedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })
  const title = `✍️ Devis ${devis.numero} signé par ${name}`
  return notifyTeam(admin, {
    devisId: devis.id,
    title,
    body: [oppTitre || devis.objet, `${fmtEur(devis.total_ttc)} TTC`, `le ${quand}`].filter(Boolean).join(' · '),
    mailLines: [
      'Bonne nouvelle : un devis vient d’être signé en ligne.', '',
      `Devis : ${devis.numero}${devis.objet ? ` — ${devis.objet}` : ''}`,
      oppTitre ? `Affaire : ${oppTitre}` : null,
      `Montant : ${fmtEur(devis.total_ht)} HT · ${fmtEur(devis.total_ttc)} TTC`,
      `Signé par : ${name}, le ${quand}${ip ? ` (IP ${ip})` : ''}`, '',
      'Le devis est passé « Accepté » et l’affaire « Gagné » dans le CRM. Le PDF signé est joint.',
    ],
    attachments: [{ filename: `Devis ${String(devis.numero).replace(/[^\w.\- ]+/g, '_')} signé.pdf`, content: signed, contentType: 'application/pdf' }],
  }, log)
}

export async function GET(request) {
  try {
    if (!checkRate(clientIp(request) || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const { searchParams } = new URL(request.url)
    const admin = adminClient()
    const devis = await findByToken(admin, searchParams.get('token'))
    if (!devis) return fail('Lien de signature invalide ou expiré.', 404)

    if (searchParams.get('pdf')) {
      const path = devis.statut_signature === 'Signé' && devis.signed_pdf_path ? devis.signed_pdf_path : devis.sign_pdf_path
      const { data, error } = await admin.storage.from(BUCKET).download(path)
      if (error || !data) return fail('Document indisponible.', 404)
      const buf = Buffer.from(await data.arrayBuffer())
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Devis-${String(devis.numero).replace(/[^\w.-]+/g, '_')}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const { data: opp } = await admin.from('crm_opportunites').select('contact_id').eq('id', devis.opportunite_id).maybeSingle()
    const { data: contact } = opp?.contact_id
      ? await admin.from('contacts').select('nom, societe').eq('id', opp.contact_id).maybeSingle()
      : { data: null }
    return Response.json({ ok: true, data: {
      numero: devis.numero,
      objet: devis.objet || '',
      date_emission: devis.date_emission,
      date_validite: devis.date_validite,
      total_ht: Number(devis.total_ht) || 0,
      total_ttc: Number(devis.total_ttc) || 0,
      client: contact?.nom || contact?.societe || '',
      statut_signature: devis.statut_signature,
      signed_at: devis.signed_at,
      signed_name: devis.signed_name,
      expired: devis.statut_signature !== 'Signé' && isExpired(devis),
      refused: devis.statut === 'Refusé',
    } })
  } catch (err) {
    log.error('GET', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}

export async function POST(request) {
  try {
    const ip = clientIp(request)
    if (!checkRate(ip || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    const devis = await findByToken(admin, body.token)
    if (!devis) return fail('Lien de signature invalide ou expiré.', 404)
    if (devis.statut_signature === 'Signé') return fail('Ce devis a déjà été signé.', 409)
    if (devis.statut === 'Refusé') return fail('Ce devis n’est plus valable.', 409)
    if (isExpired(devis)) return fail('Ce devis a expiré : contactez-nous pour une nouvelle proposition.', 409)

    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (name.length < 2) return fail('Indiquez vos nom et prénom.', 400)
    if (body.accept !== true) return fail('Cochez « Bon pour accord » pour signer.', 400)
    let signaturePng
    try { signaturePng = decodeSignaturePng(body.signature) } catch (e) { return fail(e.message, 400) }

    const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(devis.sign_pdf_path)
    if (dlErr || !file) return fail('Document introuvable.', 404)
    const original = Buffer.from(await file.arrayBuffer())
    const pdfHash = sha256(original)
    if (devis.sign_pdf_sha256 && devis.sign_pdf_sha256 !== pdfHash) {
      log.error('empreinte PDF différente', devis.id)
      return fail('Le document a été modifié depuis l’envoi : contactez-nous.', 409)
    }

    const signedAt = new Date()
    const userAgent = String(request.headers.get('user-agent') || '').slice(0, 300)
    const signed = await stampSignature(original, { name, signaturePng, signedAt, ip, numero: devis.numero, pdfHash })
    const signedPath = devis.sign_pdf_path.replace(/original-(\d+)\.pdf$/, 'signe-$1.pdf')
    const up = await admin.storage.from(BUCKET).upload(signedPath, signed, { contentType: 'application/pdf', upsert: true })
    if (up.error) return fail('Enregistrement de la signature impossible, réessayez.', 500)

    const today = todayParis()
    // Mise à jour conditionnelle : un double clic ne signe pas deux fois
    const { data: updated, error: upErr } = await admin.from('crm_devis').update({
      statut_signature: 'Signé', statut: 'Accepté', date_reponse: today,
      signed_at: signedAt.toISOString(), signed_name: name, signed_ip: ip, signed_user_agent: userAgent,
      signed_pdf_path: signedPath,
    }).eq('id', devis.id).neq('statut_signature', 'Signé').select('id')
    if (upErr) return fail('Enregistrement de la signature impossible, réessayez.', 500)
    if (!updated?.length) return fail('Ce devis a déjà été signé.', 409)

    // Affaire gagnée + trace dans l'historique (bonus : n'échoue pas la signature)
    let oppTitre = ''
    try {
      const { data: opp } = await admin.from('crm_opportunites').select('id, titre, etape, contact_id').eq('id', devis.opportunite_id).maybeSingle()
      oppTitre = opp?.titre || ''
      if (opp && !['Gagné', 'Perdu'].includes(opp.etape)) {
        await admin.from('crm_opportunites').update({
          etape: 'Gagné', probabilite: 100, date_cloture: today, montant_estime: Number(devis.total_ht) || null,
        }).eq('id', opp.id)
      }
      if (opp) {
        await admin.from('crm_interactions').insert({
          opportunite_id: opp.id, contact_id: opp.contact_id || null, type: 'Note',
          sujet: `Devis ${devis.numero} signé en ligne`,
          contenu: `Signé par ${name} le ${signedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${ip ? ` (IP ${ip})` : ''}.`,
          created_by: 'signature en ligne',
        })
      }
    } catch (e) { log.warn('suivi affaire', e?.message || e) }

    // Devis signé → accepté aussi dans Qonto (si l'API le permet)
    if (devis.qonto_quote_id) {
      try { await pushQuoteStatus(await getQontoToken(admin), devis.qonto_quote_id, 'Accepté') }
      catch (e) { log.warn('statut Qonto', e?.message || e) }
    }
    await notifySigned(admin, devis, { name, signedAt, ip, signed, oppTitre })
    return Response.json({ ok: true, data: { signed_at: signedAt.toISOString(), signed_name: name } })
  } catch (err) {
    log.error('POST', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
