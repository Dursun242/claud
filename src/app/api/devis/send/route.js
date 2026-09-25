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

// Valeurs saisies à la main dans Vercel : on tolère espaces et guillemets
// autour, et les espaces dans le mot de passe d'application Google (affiché
// par groupes de 4 : « abcd efgh ijkl mnop »).
const clean = (v) => String(v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()

function smtpConfig() {
  const host = clean(process.env.SMTP_HOST)
  const user = clean(process.env.SMTP_USER)
  const pass = clean(process.env.SMTP_PASS).replace(/\s+/g, '')
  if (!host || !user || !pass) return null
  const port = Number(clean(process.env.SMTP_PORT)) || 465
  return {
    transport: { host, port, secure: port === 465, auth: { user, pass } },
    from: clean(process.env.DEVIS_EMAIL_FROM) || user,
  }
}

// Message compréhensible selon l'erreur SMTP (nodemailer expose err.code).
function smtpErrorMessage(err) {
  const code = err?.code || ''
  const resp = Number(err?.responseCode) || 0
  if (code === 'EAUTH' || resp === 535 || resp === 534) {
    return 'Identifiants refusés par le serveur mail. Avec Gmail, SMTP_PASS doit être un mot de passe d’application (16 caractères), pas le mot de passe du compte.'
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') {
    return 'Serveur mail injoignable : vérifie SMTP_HOST (smtp.gmail.com) et SMTP_PORT (465).'
  }
  if (code === 'EENVELOPE' || resp === 550 || resp === 553) {
    return 'Adresse refusée par le serveur mail : vérifie le destinataire et DEVIS_EMAIL_FROM.'
  }
  if (code === 'EMESSAGE' || resp === 552) return 'Message refusé par le serveur mail (pièce jointe trop lourde ?).'
  return 'L’envoi a échoué — vérifie la configuration SMTP.'
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
    log.error('envoi échoué', `${err?.code || ''} ${err?.responseCode || ''} ${err?.message || err}`)
    return Response.json({ error: smtpErrorMessage(err), code: err?.code || null }, { status: 502 })
  }
}
