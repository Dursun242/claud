// Route /api/cron/daily-digest — « mail du matin » : les priorités du jour
// de l'équipe (les mêmes que le bloc « Mes priorités du jour » du tableau
// de bord), envoyées à 7 h (heure de Paris) du lundi au vendredi.
//
// Appelée par GitHub Actions (.github/workflows/daily-digest.yml) à 05:25 et
// 06:25 UTC, avec l'en-tête Authorization: Bearer <CRON_SECRET>. Un seul de
// ces deux appels tombe à 7 h à Paris (heure d'été : 05:25 UTC, heure
// d'hiver : 06:25 UTC) ; l'autre répond « hors créneau ». `?force=1` (envoi
// manuel, toujours protégé par le secret) ignore le créneau, pas
// l'anti-doublon : la date du dernier envoi est gardée dans la table
// settings (clé daily_digest_last_sent) et réservée avant l'envoi, pour
// qu'une journée ne parte qu'une fois.
//
// Les données sont communes à l'équipe : un seul calcul et un seul appel IA
// (le mot du jour, facultatif) par exécution, puis un mail par destinataire
// (comptes actifs admin / salarié de authorized_users).

import crypto from 'node:crypto'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { smtpConfig, smtpErrorMessage, sendMail } from '@/app/lib/mailer'
import { generate } from '@/app/lib/ai'
import { mapCriticalData, mapSecondaryData, NOT_DEMO_FILTER } from '@/app/lib/dashboardData'
import { loadCrmWith } from '@/app/lib/crmLoad'
import { buildDailyPriorities } from '@/app/lib/dailyPriorities'
import { MOT_DU_JOUR_SYSTEM, prioritiesDigest, motDuJourPrompt, cleanMotDuJour } from '@/app/lib/priorities'
import { parisClock, buildDigestMail, SEND_HOUR, LAST_SEND_HOUR } from '@/app/lib/dailyDigest'

export const maxDuration = 60

const log = createLogger('cron-daily-digest')
const LAST_SENT_KEY = 'daily_digest_last_sent'
const STAFF_ROLES = ['admin', 'salarié', 'salarie']

function authorized(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(String(request.headers.get('authorization') || ''))
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

const requestUrl = (request) => {
  try { return new URL(request.url) } catch { return null }
}

// Mêmes tables et même mise en forme que le tableau de bord de l'équipe
// (SB.loadCritical / SB.loadSecondary) ; seules celles utiles aux priorités.
async function loadDashboard(admin) {
  const [ch, ta, os, co, pl, rv, cc] = await Promise.all([
    admin.from('chantiers').select('*').or(NOT_DEMO_FILTER).order('created_at', { ascending: false }),
    admin.from('taches').select('*').order('created_at', { ascending: false }),
    admin.from('ordres_service').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('contacts').select('*').order('nom'),
    admin.from('planning').select('*').order('debut'),
    admin.from('rdv').select('*').order('date'),
    admin.from('contact_chantiers').select('*'),
  ])
  const failed = [['chantiers', ch], ['taches', ta], ['ordres_service', os], ['contacts', co], ['planning', pl], ['rdv', rv], ['contact_chantiers', cc]]
    .find(([, r]) => r.error)
  if (failed) throw new Error(`Chargement ${failed[0]} impossible : ${failed[1].error.message}`)
  const { _demoIds, ...critical } = mapCriticalData({ chantiers: ch.data, taches: ta.data, ordresService: os.data })
  const secondary = mapSecondaryData({ contacts: co.data, planning: pl.data, rdv: rv.data, contactChantiers: cc.data }, _demoIds)
  return { ...critical, ...secondary }
}

// Documents des entreprises (migration 036) ; null si la table n'existe pas
async function loadConformiteDocs(admin) {
  const { data, error } = await admin.from('contact_documents').select('*')
  if (error) {
    if (!/does not exist|schema cache/i.test(error.message || '')) log.warn('documents des entreprises', error.message)
    return null
  }
  return data || []
}

async function staffEmails(admin) {
  const { data, error } = await admin.from('authorized_users').select('email, role, actif')
  if (error) throw new Error('Lecture des comptes impossible : ' + error.message)
  return [...new Set((data || [])
    .filter(u => u.actif === true && STAFF_ROLES.includes(u.role) && u.email)
    .map(u => String(u.email).trim().toLowerCase())
    .filter(Boolean))]
}

// Réserve la journée : mise à jour conditionnelle (la valeur lue n'a pas
// changé entre-temps) ou création de la ligne (clé primaire : un seul
// gagnant). false → un autre appel a déjà pris la journée.
async function claimDay(admin, row, today) {
  if (!row) {
    const { error } = await admin.from('settings').insert({ key: LAST_SENT_KEY, value: today })
    return !error
  }
  let q = admin.from('settings').update({ value: today }).eq('key', LAST_SENT_KEY)
  q = row.value == null ? q.is('value', null) : q.eq('value', row.value)
  const { data, error } = await q.select('key')
  return !error && (data || []).length > 0
}

// Aucun mail parti : la journée est libérée pour un nouvel essai
async function releaseDay(admin, row, today) {
  try {
    const q = row
      ? admin.from('settings').update({ value: row.value ?? null }).eq('key', LAST_SENT_KEY).eq('value', today)
      : admin.from('settings').delete().eq('key', LAST_SENT_KEY).eq('value', today)
    const { error } = await q
    if (error) log.warn('libération de la date d’envoi', error.message)
  } catch (e) { log.warn('libération de la date d’envoi', e?.message || e) }
}

async function motDuJour(top, total) {
  try {
    const ai = await generate({
      system: MOT_DU_JOUR_SYSTEM,
      messages: [{ role: 'user', content: motDuJourPrompt(prioritiesDigest(top, total)) }],
      maxTokens: 150,
      // Court et sans nouvel essai : la route doit rester sous maxDuration
      // même si les deux fournisseurs répondent mal.
      timeoutMs: 12_000,
      maxRetries: 0,
      log,
    })
    if (!ai?.ok) { log.warn('mot du jour indisponible', ai?.message || ''); return '' }
    return cleanMotDuJour(ai.text)
  } catch (e) {
    log.warn('mot du jour indisponible', e?.message || e)
    return ''
  }
}

export async function GET(request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: 'CRON_SECRET non configuré' }, { status: 503 })
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  const cfg = smtpConfig()
  if (!cfg) {
    return Response.json(
      { error: 'Envoi par mail non configuré (variables SMTP_*).', code: 'EMAIL_NOT_CONFIGURED' },
      { status: 503 },
    )
  }

  const url = requestUrl(request)
  const force = url?.searchParams.get('force') === '1'
  const clock = parisClock(new Date())
  if (!force && (clock.weekday < 1 || clock.weekday > 5
    || clock.hour < SEND_HOUR || clock.hour > LAST_SEND_HOUR)) {
    return Response.json({ ok: true, skipped: 'hors créneau' })
  }

  try {
    const admin = adminClient()
    const { data: lastRow, error: lastErr } = await admin.from('settings')
      .select('value').eq('key', LAST_SENT_KEY).maybeSingle()
    // Date illisible : on n'envoie pas (risque de doublon)
    if (lastErr) return Response.json({ error: 'Lecture de la date du dernier envoi impossible : ' + lastErr.message }, { status: 500 })
    if (lastRow?.value === clock.today) return Response.json({ ok: true, skipped: 'déjà envoyé aujourd’hui' })

    const [data, crm, conformiteDocs] = await Promise.all([loadDashboard(admin), loadCrmWith(admin), loadConformiteDocs(admin)])
    const { priorities } = buildDailyPriorities({
      data, crm, today: clock.today, nowHM: clock.hm, conformiteDocs,
      // Date de Paris pour le CRM (lib/crm.js lit la date UTC de l'instant)
      now: new Date(`${clock.today}T12:00:00Z`),
    })
    if (!priorities.total) return Response.json({ ok: true, skipped: 'rien à signaler' })

    const emails = await staffEmails(admin)
    if (!emails.length) return Response.json({ ok: true, skipped: 'aucun destinataire' })

    // Mot du jour AVANT de réserver la journée : si la fonction est coupée
    // pendant l'appel IA, la journée n'est pas marquée envoyée à tort.
    const mot = await motDuJour(priorities.top, priorities.total)

    if (!(await claimDay(admin, lastRow, clock.today))) {
      return Response.json({ ok: true, skipped: 'déjà envoyé aujourd’hui' })
    }
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || url?.origin || ''
    // Top 3, puis les 10 suivantes en liste courte
    const mail = buildDigestMail({ priorities, dateLabel: clock.label, mot, appUrl })

    let sent = 0
    let failed = 0
    let lastSmtpErr = null
    for (const to of emails) {
      try {
        await sendMail(cfg, { to, subject: mail.subject, text: mail.text, html: mail.html })
        sent++
      } catch (e) {
        failed++
        lastSmtpErr = e
        log.warn('envoi du mail du matin', `${to} ${e?.code || ''} ${e?.message || e}`)
      }
    }
    if (!sent) {
      await releaseDay(admin, lastRow, clock.today)
      return Response.json({ ok: false, sent, failed, error: smtpErrorMessage(lastSmtpErr) }, { status: 502 })
    }
    return Response.json({ ok: true, sent, failed, total: priorities.total, mot: !!mot })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
