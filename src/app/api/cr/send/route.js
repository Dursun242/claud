// Route /api/cr/send — envoi d'un compte rendu de chantier par email :
// PDF (page de garde + convocation) en pièce jointe, un mail par
// destinataire avec ses propres actions et relances (texte préparé par
// lib/crSuivi.crMailText côté écran).
//
// Réservée au staff (verifyStaff). SMTP non configuré → 503
// { code: 'EMAIL_NOT_CONFIGURED' } : l'écran retombe sur le PDF téléchargé
// + mail pré-rempli. La route n'écrit rien en base.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { parseEmails } from '@/app/lib/devisAi'
import { smtpConfig, smtpErrorMessage, sendMail } from '@/app/lib/mailer'
import { devisMailHtml } from '@/app/lib/devisMailHtml'
import { COMPANY } from '@/app/lib/company'
import { LOGO_CID, LOGO_PNG_BASE64 } from '@/app/lib/companyLogo'

export const maxDuration = 60

const log = createLogger('cr-send')
const checkRate = createRateLimiter({ limit: 5, windowMs: 60_000 })

const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_MESSAGES = 30

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) {
      return Response.json({ error: 'Trop d’envois — attendez 1 minute.' }, { status: 429 })
    }
    const { user, status } = await verifyStaff(request)
    if (!user) {
      const error = status === 403
        ? 'Réservé à l’équipe : ton compte doit être admin ou salarié actif.'
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
    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
    if (!subject) return Response.json({ error: 'Objet requis' }, { status: 400 })

    const raw = Array.isArray(body.messages) ? body.messages : []
    if (!raw.length) return Response.json({ error: 'Aucun destinataire' }, { status: 400 })
    if (raw.length > MAX_MESSAGES) return Response.json({ error: 'Trop de destinataires' }, { status: 400 })
    const messages = []
    for (const m of raw) {
      const to = parseEmails(m?.to)
      if (to.list.length !== 1 || to.invalid.length) {
        return Response.json({ error: `Adresse invalide : ${String(m?.to || '(vide)').slice(0, 80)}` }, { status: 400 })
      }
      const text = String(m?.text || '').slice(0, 20_000)
      if (!text.trim()) return Response.json({ error: 'Message vide' }, { status: 400 })
      messages.push({ to: to.list[0], text })
    }
    const unique = new Set(messages.map(m => m.to.toLowerCase()))
    if (unique.size !== messages.length) return Response.json({ error: 'Destinataire en double' }, { status: 400 })

    const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;[^,]*,/, '')
    if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return Response.json({ error: 'PDF manquant' }, { status: 400 })
    const pdf = Buffer.from(b64, 'base64')
    if (pdf.length > MAX_PDF_BYTES) return Response.json({ error: 'PDF trop volumineux' }, { status: 400 })
    if (pdf.subarray(0, 4).toString() !== '%PDF') return Response.json({ error: 'Pièce jointe invalide' }, { status: 400 })
    const filename = (String(body.filename || 'Compte-rendu.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'Compte-rendu.pdf')
      .replace(/(\.pdf)?$/i, '.pdf')

    const logo = { filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }
    const files = [{ filename, content: pdf, contentType: 'application/pdf' }]
    const html = (text) => devisMailHtml({
      body: text, company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`, attachments: [filename],
    })

    const sent = [], failed = []
    let lastErr = null
    for (const m of messages) {
      try {
        await sendMail(cfg, {
          to: m.to, replyTo: user.email || undefined, subject, text: m.text, html: html(m.text),
          attachments: [...files, logo],
        })
        sent.push(m.to)
      } catch (e) {
        lastErr = e
        log.warn('envoi CR', `${m.to} ${e?.code || ''} ${e?.message || e}`)
        failed.push({ to: m.to, error: smtpErrorMessage(e) })
      }
    }
    if (!sent.length) {
      return Response.json({ error: smtpErrorMessage(lastErr), code: lastErr?.code || null, failed }, { status: 502 })
    }
    // Copie à l'expéditeur seulement si demandée (copyMe: true) : liste des
    // destinataires + premier message
    if (body.copyMe === true && user.email) {
      const text = `Compte rendu envoyé à : ${sent.join(', ')}\n\n---\n\n${messages[0].text}`
      try {
        await sendMail(cfg, { to: user.email, subject: `[Copie] ${subject}`, text, html: html(text), attachments: [...files, logo] })
      } catch (e) { log.warn('copie expéditeur', e?.code || e?.message || e) }
    }
    return Response.json({ ok: true, sent, failed })
  } catch (err) {
    log.error('envoi échoué', `${err?.code || ''} ${err?.message || err}`)
    return Response.json({ error: smtpErrorMessage(err), code: err?.code || null }, { status: 502 })
  }
}
