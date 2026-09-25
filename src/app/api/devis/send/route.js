// Route /api/devis/send — envoi d'un devis par email, PDF en pièce jointe.
//
// Réservée au staff (verifyStaff). Envoi SMTP (nodemailer) avec le compte
// configuré dans les variables d'environnement (SMTP_*). Si le SMTP n'est
// pas configuré, la route répond 503 { code: 'EMAIL_NOT_CONFIGURED' } et le
// front retombe sur l'ancien flux (PDF téléchargé + mail pré-rempli).
//
// La route n'écrit rien en base : le passage du devis en « Envoyé » est fait
// côté front après un envoi réussi (même logique que le flux manuel).

import nodemailer from 'nodemailer'
import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { parseEmails } from '@/app/lib/devisAi'

export const maxDuration = 30

const log = createLogger('devis-send')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })

const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_RECIPIENTS = 10

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, DEVIS_EMAIL_FROM } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  const port = Number(SMTP_PORT) || 465
  return {
    transport: { host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } },
    from: DEVIS_EMAIL_FROM || SMTP_USER,
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) {
      return Response.json({ error: 'Trop d’envois — attendez 1 minute.' }, { status: 429 })
    }
    const { user, status } = await verifyStaff(request)
    if (!user) {
      return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
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
    const text = String(body.text || '').slice(0, 20_000)
    if (!subject || !text.trim()) return Response.json({ error: 'Objet et message requis' }, { status: 400 })

    const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;[^,]*,/, '')
    if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return Response.json({ error: 'PDF manquant' }, { status: 400 })
    const pdf = Buffer.from(b64, 'base64')
    if (pdf.length > MAX_PDF_BYTES) return Response.json({ error: 'PDF trop volumineux' }, { status: 400 })
    if (pdf.subarray(0, 4).toString() !== '%PDF') return Response.json({ error: 'Pièce jointe invalide' }, { status: 400 })
    const filename = (String(body.filename || 'Devis.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'Devis.pdf')
      .replace(/(\.pdf)?$/i, '.pdf')

    const transporter = nodemailer.createTransport(cfg.transport)
    const info = await transporter.sendMail({
      from: cfg.from,
      to: to.list,
      cc: cc.list.length ? cc.list : undefined,
      // Copie à l'expéditeur : le devis envoyé reste dans la boîte mail
      bcc: body.copyMe === false ? undefined : (user.email || undefined),
      replyTo: user.email || undefined,
      subject,
      text,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    })
    return Response.json({ ok: true, messageId: info?.messageId || null, to: to.list })
  } catch (err) {
    log.error('envoi échoué', err?.message || err)
    return Response.json({ error: 'L’envoi a échoué — vérifie la configuration SMTP.' }, { status: 502 })
  }
}
