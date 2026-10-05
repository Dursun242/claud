// Route /api/devis/relance — relance d'un devis resté sans réponse, avec
// choix de réponse pour le client (migration 041).
//
// Réservée au staff (verifyStaff). Le mail liste les raisons possibles
// (budget, autre proposition, projet reporté…, autre) : chaque choix ouvre
// la page publique /reponse/<jeton> où le client confirme. Le jeton est
// celui du suivi des ouvertures (crm_devis.track_token, migration 030).
//
// Après l'envoi : événement « relance » sur le devis, anciennes relances du
// devis marquées faites et nouvelle relance programmée à J+7 dans le CRM.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { parseEmails } from '@/app/lib/devisAi'
import { smtpConfig, smtpErrorMessage, sendMail } from '@/app/lib/mailer'
import { adminClient } from '@/app/lib/supabaseClients'
import { devisMailHtml } from '@/app/lib/devisMailHtml'
import { COMPANY } from '@/app/lib/company'
import { LOGO_CID, LOGO_PNG_BASE64 } from '@/app/lib/companyLogo'
import { newSignToken } from '@/app/lib/devisSignature'
import { recordDevisEvent } from '@/app/lib/devisTracking'
import { closeDevisFollowUps } from '@/app/lib/devisWon'
import { relanceMailText, relanceChoices, reponseUrl } from '@/app/lib/devisRelance'

export const maxDuration = 30

const log = createLogger('devis-relance')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })
const MAX_RECIPIENTS = 10
const RELANCE_JOURS = 7
const fail = (error, status, extra = {}) => Response.json({ error, ...extra }, { status })
const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) return fail('Trop d’envois — attendez 1 minute.', 429)
    const { user, status } = await verifyStaff(request)
    if (!user) return fail(status === 403 ? 'Réservé à l’équipe.' : 'Non autorisé — reconnecte-toi.', status)

    const cfg = smtpConfig()
    if (!cfg) return fail('Envoi par mail non configuré (variables SMTP_*).', 503, { code: 'EMAIL_NOT_CONFIGURED' })

    const body = await request.json().catch(() => ({}))
    const devisId = String(body.devisId || '')
    if (!/^[0-9a-f-]{36}$/i.test(devisId)) return fail('Devis manquant', 400)
    const to = parseEmails(body.to)
    const cc = parseEmails(body.cc)
    if (!to.list.length) return fail('Destinataire manquant', 400)
    const invalid = [...to.invalid, ...cc.invalid]
    if (invalid.length) return fail(`Adresse invalide : ${invalid.join(', ')}`, 400)
    if (to.list.length + cc.list.length > MAX_RECIPIENTS) return fail('Trop de destinataires', 400)
    const subject = String(body.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
    const intro = String(body.intro || '').slice(0, 10_000)
    const outro = String(body.outro || '').slice(0, 10_000)
    if (!subject || !intro.trim()) return fail('Objet et message requis', 400)

    const admin = adminClient()
    const { data: devis, error } = await admin.from('crm_devis')
      .select('id, numero, objet, statut, statut_signature, opportunite_id, track_token').eq('id', devisId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!devis) return fail('Devis introuvable', 404)
    if (devis.statut !== 'Envoyé' || devis.statut_signature === 'Signé') {
      return fail('Ce devis a déjà reçu une réponse : pas de relance.', 409)
    }
    let token = devis.track_token
    if (!token) {
      token = newSignToken()
      const { error: upErr } = await admin.from('crm_devis').update({ track_token: token }).eq('id', devisId)
      if (upErr) throw new Error(upErr.message)
    }

    const origin = new URL(request.url).origin
    const text = relanceMailText({ intro, outro, link: reponseUrl(origin, token) })
    const html = (track) => devisMailHtml({
      body: intro, bodyAfter: outro, company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`,
      choicesTitle: 'Cliquez simplement sur la réponse qui correspond à votre situation :',
      choices: relanceChoices(origin, token),
      trackUrl: track ? `${origin}/api/devis/track?t=${token}&r=1` : '',
    })
    const logo = { filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }

    const info = await sendMail(cfg, {
      to: to.list, cc: cc.list.length ? cc.list : undefined, replyTo: user.email || undefined,
      subject, text, html: html(true), attachments: [logo],
    })
    if (body.copyMe === true && user.email) {
      try {
        await sendMail(cfg, { to: user.email, subject: `[Copie] ${subject}`, text, html: html(false), attachments: [logo] })
      } catch (e) { log.warn('copie expéditeur', e?.code || e?.message || e) }
    }

    // Le mail est parti : le suivi ne doit plus faire échouer la requête
    await recordDevisEvent(admin, devis.id, 'relance', { detail: { to: to.list }, dedup: false, log })
    let suivi = true
    try {
      await closeDevisFollowUps(admin, devis, { log })
      if (devis.opportunite_id) {
        const { data: opp } = await admin.from('crm_opportunites').select('contact_id').eq('id', devis.opportunite_id).maybeSingle()
        const { error: intErr } = await admin.from('crm_interactions').insert({
          opportunite_id: devis.opportunite_id, contact_id: opp?.contact_id || null, type: 'Email',
          sujet: `Devis ${devis.numero} relancé`, contenu: `Relance avec choix de réponse envoyée à ${to.list.join(', ')}`,
          date: new Date().toISOString(), prochaine_action: 'Relancer le devis',
          prochaine_action_date: addDays(todayParis(), RELANCE_JOURS), action_faite: false, created_by: user.email || null,
        })
        if (intErr) throw new Error(intErr.message)
      }
    } catch (e) {
      suivi = false
      log.warn('suivi CRM de la relance', e?.message || e)
    }
    return Response.json({ ok: true, messageId: info?.messageId || null, to: to.list, suivi })
  } catch (err) {
    log.error('relance échouée', `${err?.code || ''} ${err?.message || err}`)
    return fail(smtpErrorMessage(err), 502, { code: err?.code || null })
  }
}
