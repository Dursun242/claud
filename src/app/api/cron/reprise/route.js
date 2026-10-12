// Route /api/cron/reprise — relance automatique des affaires « En attente »
// (migrations 043 et 044). Tous les matins en semaine, le client dont
// l'affaire arrive à sa date de reprise reçoit un mail de reprise de contact
// avec des choix de réponse (page publique /reprise/<jeton>).
//
// Appelée par GitHub Actions (.github/workflows/reprise.yml) avec l'en-tête
// Authorization: Bearer <CRON_SECRET>. Un seul mail par date de reprise ;
// relance désactivable par affaire (reprise_auto). Sans email du contact,
// le rappel reste dans les relances du CRM. `?dry=1` : liste sans envoyer.

import crypto from 'node:crypto'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { smtpConfig } from '@/app/lib/mailer'
import { notifyTeam } from '@/app/lib/devisNotify'
import { todayParis } from '@/app/lib/conformiteServer'
import { dueReprises } from '@/app/lib/crmReprise'
import { sendRepriseMail } from '@/app/lib/crmRepriseServer'

export const maxDuration = 60

const log = createLogger('cron-reprise')
const MAX_PAR_PASSAGE = 20

function authorized(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(String(request.headers.get('authorization') || ''))
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
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
    const { data: opps, error } = await admin.from('crm_opportunites').select('*').eq('etape', 'En attente')
    if (error) {
      if (/does not exist|schema cache|check constraint/i.test(error.message || '')) return Response.json({ ok: true, skipped: 'migrations 043 / 044 non appliquées' })
      throw new Error(error.message)
    }
    if (opps?.length && !('reprise_envoyee_le' in opps[0])) return Response.json({ ok: true, skipped: 'migration 044 non appliquée' })

    const ids = [...new Set((opps || []).map(o => o.contact_id).filter(Boolean))]
    const { data: contacts, error: cErr } = ids.length
      ? await admin.from('contacts').select('id, nom, email').in('id', ids)
      : { data: [], error: null }
    if (cErr) throw new Error(cErr.message)
    const contactsById = new Map((contacts || []).map(c => [c.id, c]))
    const due = dueReprises(opps || [], contactsById, today)

    if (dry) return Response.json({ ok: true, dry: true, due: due.map(({ opp, contact }) => ({ id: opp.id, titre: opp.titre, to: contact.email, date_reprise: opp.date_reprise })) })

    const sent = [], failed = []
    for (const { opp, contact } of due.slice(0, MAX_PAR_PASSAGE)) {
      try {
        await sendRepriseMail(admin, cfg, { opp, contact, origin: url.origin, today, log })
        sent.push({ titre: opp.titre, to: contact.email })
      } catch (e) {
        log.warn('mail de reprise', `${opp.id} ${e?.code || ''} ${e?.message || e}`)
        failed.push({ titre: opp.titre, to: contact.email })
      }
    }

    if (sent.length) {
      await notifyTeam(admin, {
        devisId: null,
        title: `📨 ${sent.length} mail${sent.length > 1 ? 's' : ''} de reprise envoyé${sent.length > 1 ? 's' : ''} (affaires en attente)`,
        body: sent.map(s => s.titre).join(' · ').slice(0, 300),
        mailLines: [
          'Date de reprise atteinte : les clients de ces affaires en attente ont reçu un mail de reprise de contact.', '',
          ...sent.map(s => `- ${s.titre} (${s.to})`), '',
          'Leurs réponses arriveront dans le CRM. Sans réponse, un rappel apparaîtra dans les relances dans 14 jours.',
        ],
      }, log)
    }
    return Response.json({ ok: true, sent: sent.length, failed: failed.length, restants: Math.max(0, due.length - MAX_PAR_PASSAGE) })
  } catch (err) {
    log.error('relance des affaires en attente', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
