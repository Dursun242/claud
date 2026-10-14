// Route /api/cron/echeances — rappel aux entreprises deux jours avant
// l'échéance de leurs actions de chantier (migration 046). Tous les matins
// en semaine ; le vendredi, les échéances de lundi et mardi sont aussi
// rappelées. Un mail par entreprise et par chantier, avec le lien de
// réponse sans compte (/actions/<jeton>). Une seule fois par échéance
// (taches.rappel_echeance) : une échéance reportée est rappelée à nouveau.
//
// Appelée par GitHub Actions (.github/workflows/echeances.yml) avec l'en-tête
// Authorization: Bearer <CRON_SECRET>. `?dry=1` : liste sans envoyer.

import crypto from 'node:crypto'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { smtpConfig, sendMail } from '@/app/lib/mailer'
import { devisMailHtml } from '@/app/lib/devisMailHtml'
import { COMPANY } from '@/app/lib/company'
import { LOGO_CID, LOGO_PNG_BASE64 } from '@/app/lib/companyLogo'
import { todayParis } from '@/app/lib/conformiteServer'
import { dueEcheances, emailFor, echeanceMailText, actionsUrl, sameEntreprise, withoutLinkParagraph } from '@/app/lib/crReponse'
import { ensureLien, isMissingTable } from '@/app/lib/crReponseServer'

export const maxDuration = 60

const log = createLogger('cron-echeances')
const MAX_PAR_PASSAGE = 25
const CLOSED = ['Terminé', 'Annulé']

function authorized(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(String(request.headers.get('authorization') || ''))
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

const weekdayParis = (d = new Date()) => {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w)
}

export async function GET(request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: 'CRON_SECRET non configuré' }, { status: 503 })
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  const url = new URL(request.url)
  const dry = url.searchParams.get('dry') === '1'
  const cfg = smtpConfig()
  if (!dry && !cfg) {
    return Response.json({ error: 'Envoi par mail non configuré (variables SMTP_*).', code: 'EMAIL_NOT_CONFIGURED' }, { status: 503 })
  }

  try {
    const admin = adminClient()
    const today = todayParis()
    const { data: tasks, error } = await admin.from('taches')
      .select('id, chantier_id, titre, entreprise, echeance, statut, num_point, rappel_echeance')
      .neq('statut', 'Terminé').not('echeance', 'is', null)
    if (error) {
      if (isMissingTable(error)) return Response.json({ ok: true, skipped: 'migration 046 non appliquée' })
      throw new Error(error.message)
    }
    const { data: chantiers } = await admin.from('chantiers').select('id, nom, statut')
    const chantierById = new Map((chantiers || []).map(c => [c.id, c]))
    const closed = new Set((chantiers || []).filter(c => CLOSED.includes(c.statut)).map(c => c.id))
    const due = dueEcheances(tasks || [], { today, weekday: weekdayParis(), closedChantiers: closed })
    if (!due.length) return Response.json({ ok: true, sent: 0 })

    // Un mail par chantier et par entreprise
    const groups = []
    for (const t of due) {
      const g = groups.find(x => x.chantierId === t.chantier_id && sameEntreprise(x.entreprise, t.entreprise))
      if (g) g.actions.push(t)
      else groups.push({ chantierId: t.chantier_id, entreprise: String(t.entreprise).trim(), actions: [t] })
    }
    const chIds = [...new Set(groups.map(g => g.chantierId))]
    const [{ data: crs }, { data: contacts }] = await Promise.all([
      admin.from('compte_rendus').select('chantier_id, numero, intervenants').in('chantier_id', chIds),
      admin.from('contacts').select('nom, societe, email, email_travaux'),
    ])
    const lastCr = (chId) => (crs || []).filter(c => c.chantier_id === chId).sort((a, b) => (Number(b.numero) || 0) - (Number(a.numero) || 0))[0]
    for (const g of groups) g.to = emailFor(g.entreprise, { intervenants: lastCr(g.chantierId)?.intervenants || [], contacts: contacts || [] })
    const ready = groups.filter(g => g.to)

    if (dry) {
      return Response.json({
        ok: true, dry: true,
        due: ready.map(g => ({ chantier: chantierById.get(g.chantierId)?.nom, entreprise: g.entreprise, to: g.to.email, actions: g.actions.map(a => a.titre) })),
        sansEmail: groups.filter(g => !g.to).map(g => g.entreprise),
      })
    }

    const logo = { filename: 'logo-id-maitrise.png', content: Buffer.from(LOGO_PNG_BASE64, 'base64'), contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }
    let sent = 0, failed = 0
    for (const g of ready.slice(0, MAX_PAR_PASSAGE)) {
      const chantier = chantierById.get(g.chantierId)?.nom || ''
      try {
        const link = actionsUrl(url.origin, await ensureLien(admin, { chantierId: g.chantierId, entreprise: g.entreprise, nom: g.to.nom, email: g.to.email, today }))
        const subject = `Rappel : ${g.actions.length > 1 ? `${g.actions.length} actions attendues` : 'action attendue'} — ${chantier}`
        const text = echeanceMailText({ nom: g.to.nom, chantier, actions: g.actions, link, company: COMPANY })
        await sendMail(cfg, {
          to: g.to.email, subject, text,
          html: devisMailHtml({
            body: withoutLinkParagraph(text), company: COMPANY, title: subject, logoSrc: `cid:${LOGO_CID}`,
            action: { url: link, label: 'Répondre sur mes actions', hint: 'C’est fait, besoin de plus de temps ou désaccord : sans créer de compte.' },
          }),
          attachments: [logo],
        })
        for (const a of g.actions) {
          const { error: uErr } = await admin.from('taches').update({ rappel_echeance: a.echeance }).eq('id', a.id)
          if (uErr) log.warn('rappel noté', uErr.message)
        }
        sent += 1
      } catch (e) {
        failed += 1
        log.warn('rappel échéance', `${g.entreprise} ${e?.code || ''} ${e?.message || e}`)
      }
    }
    return Response.json({ ok: true, sent, failed, sansEmail: groups.length - ready.length, restants: Math.max(0, ready.length - MAX_PAR_PASSAGE) })
  } catch (err) {
    log.error('rappels d’échéance', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
