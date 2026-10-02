// Route /api/devis/send — envoi d'un devis par email, PDF en pièce jointe.
//
// Réservée au staff (verifyStaff). Envoi SMTP (nodemailer) avec le compte
// configuré dans les variables d'environnement (SMTP_*). Si le SMTP n'est
// pas configuré, la route répond 503 { code: 'EMAIL_NOT_CONFIGURED' } et le
// front retombe sur l'ancien flux (PDF téléchargé + mail pré-rempli).
//
// La route n'écrit rien en base : le passage du devis en « Envoyé » est fait
// côté front après un envoi réussi (même logique que le flux manuel).

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { parseEmails } from '@/app/lib/devisAi'
import { smtpConfig, smtpErrorMessage, sendMail } from '@/app/lib/mailer'
import { adminClient } from '@/app/lib/supabaseClients'
import { isDocPath, docDisplayName, MAX_ATTACH_TOTAL, MAX_ATTACH_COUNT } from '@/app/lib/devisDocuments'
import { devisMailHtml, isSignUrl } from '@/app/lib/devisMailHtml'
import { COMPANY } from '@/app/lib/company'
import { LOGO_CID, LOGO_PNG_BASE64 } from '@/app/lib/companyLogo'
import { newSignToken } from '@/app/lib/devisSignature'

export const maxDuration = 30

const log = createLogger('devis-send')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })

const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_RECIPIENTS = 10

class AttachError extends Error {}

/**
 * URL de l'image de suivi des ouvertures (migration 030) : jeton propre au
 * devis, réutilisé d'un envoi à l'autre. null si le suivi n'est pas
 * disponible (migration absente, devis inconnu) : le mail part sans.
 */
async function trackingUrl(request, devisId) {
  if (typeof devisId !== 'string' || !/^[0-9a-f-]{36}$/i.test(devisId)) return null
  try {
    const origin = new URL(request.url).origin
    const admin = adminClient()
    const { data: devis, error } = await admin.from('crm_devis').select('id, track_token').eq('id', devisId).maybeSingle()
    if (error || !devis) return null
    let token = devis.track_token
    if (!token) {
      token = newSignToken()
      const { error: upErr } = await admin.from('crm_devis').update({ track_token: token }).eq('id', devisId)
      if (upErr) return null
    }
    return `${origin}/api/devis/track?t=${token}`
  } catch (e) {
    log.warn('suivi indisponible', e?.message || e)
    return null
  }
}

/** Pièces jointes en plus du devis (Kbis, décennale, fichiers joints). */
async function loadAttachments(paths) {
  const list = [...new Set(Array.isArray(paths) ? paths : [])]
  if (!list.length) return []
  if (list.length > MAX_ATTACH_COUNT) throw new AttachError('Trop de pièces jointes')
  if (!list.every(isDocPath)) throw new AttachError('Pièce jointe invalide')
  const storage = adminClient().storage.from('attachments')
  const out = []
  let total = 0
  for (const path of list) {
    const { data, error } = await storage.download(path)
    if (error || !data) throw new AttachError(`Pièce jointe introuvable : ${docDisplayName(path)}`)
    const content = Buffer.from(await data.arrayBuffer())
    total += content.length
    if (total > MAX_ATTACH_TOTAL) throw new AttachError('Pièces jointes trop volumineuses (15 Mo au total).')
    out.push({ filename: docDisplayName(path), content, ...(data.type ? { contentType: data.type } : {}) })
  }
  return out
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) {
      return Response.json({ error: 'Trop d’envois — attendez 1 minute.' }, { status: 429 })
    }
    const { user, status } = await verifyStaff(request)
    if (!user) {
      const error = status === 403
        ? 'Réservé à l’équipe : ton compte doit être admin ou salarié actif (Admin → utilisateurs).'
        : status === 500 ? 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY).' : 'Non autorisé — reconnecte-toi.'
      return Response.json({ error }, { status })
    }

    const cfg = smtpConfig()
    if (!cfg) {
      return Response.json(
        { error: 'Envoi par mail non configuré (variables SMTP_*).', code: 'EMAIL_NOT_CONFIGURED' },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const to = parseEmails(body.to)
    const cc = parseEmails(body.cc)
    if (!to.list.length) return Response.json({ error: 'Destinataire manquant' }, { status: 400 })
    const invalid = [...to.invalid, ...cc.invalid]
    if (invalid.length) return Response.json({ error: `Adresse invalide : ${invalid.join(', ')}` }, { status: 400 })
    if (to.list.length + cc.list.length > MAX_RECIPIENTS) {
      return Response.json({ error: 'Trop de destinataires' }, { status: 400 })
    }

    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
    const message = String(body.text || '').slice(0, 20_000)
    if (!subject || !message.trim()) return Response.json({ error: 'Objet et message requis' }, { status: 400 })
    // Lien de signature en ligne : bouton dans la version HTML
    const signUrl = body.signUrl ? String(body.signUrl) : ''
    if (signUrl && !isSignUrl(signUrl)) return Response.json({ error: 'Lien de signature invalide' }, { status: 400 })
    const text = signUrl ? `${message}\n\nPour signer ce devis en ligne (bon pour accord) :\n${signUrl}` : message

    const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;[^,]*,/, '')
    if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return Response.json({ error: 'PDF manquant' }, { status: 400 })
    const pdf = Buffer.from(b64, 'base64')
    if (pdf.length > MAX_PDF_BYTES) return Response.json({ error: 'PDF trop volumineux' }, { status: 400 })
    if (pdf.subarray(0, 4).toString() !== '%PDF') return Response.json({ error: 'Pièce jointe invalide' }, { status: 400 })
    const filename = (String(body.filename || 'Devis.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'Devis.pdf')
      .replace(/(\.pdf)?$/i, '.pdf')

    let extra
    try { extra = await loadAttachments(body.attachments) } catch (e) {
      if (e instanceof AttachError) return Response.json({ error: e.message }, { status: 400 })
      throw e
    }

    const logo = { filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }
    const files = [{ filename, content: pdf, contentType: 'application/pdf' }, ...extra]
    const html = (trackUrl) => devisMailHtml({
      body: message, signUrl, company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`, trackUrl,
      attachments: files.map(f => f.filename),
    })
    const trackUrl = await trackingUrl(request, body.devisId)

    const info = await sendMail(cfg, {
      to: to.list,
      cc: cc.list.length ? cc.list : undefined,
      replyTo: user.email || undefined,
      subject,
      text,
      html: html(trackUrl),
      // Logo intégré au corps du mail (pas une pièce jointe visible)
      attachments: [...files, logo],
    })
    // Copie à l'expéditeur seulement si demandée (case « M'envoyer une
    // copie », décochée par défaut), envoyée à part et sans image de suivi :
    // ses propres ouvertures ne comptent pas
    if (body.copyMe === true && user.email) {
      try {
        await sendMail(cfg, { to: user.email, subject: `[Copie] ${subject}`, text, html: html(null), attachments: [...files, logo] })
      } catch (e) { log.warn('copie expéditeur', e?.code || e?.message || e) }
    }
    return Response.json({ ok: true, messageId: info?.messageId || null, to: to.list })
  } catch (err) {
    log.error('envoi échoué', `${err?.code || ''} ${err?.responseCode || ''} ${err?.message || err}`)
    return Response.json({ error: smtpErrorMessage(err), code: err?.code || null }, { status: 502 })
  }
}
