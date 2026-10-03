// Route /api/cron/conformite — relance automatique, chaque semaine, des
// entreprises dont les documents administratifs (Kbis, décennale,
// attestations fiscale et URSSAF, RIB) manquent, sont erronés ou expirent.
// Vérification du lundi au vendredi.
//
// Appelée par GitHub Actions (.github/workflows/conformite.yml) avec
// l'en-tête Authorization: Bearer <CRON_SECRET>. Ne concerne que les
// entreprises qui travaillent sur un chantier en cours et ont un email.
// Règles (lib/conformite.needsAutoRelance) : un mail par semaine tant qu'un
// document manque, est erroné (à renvoyer) ou expire bientôt. Ce que
// l'équipe vérifie elle-même (dates à saisir, IBAN qui change) ne déclenche
// pas de relance. `?dry=1` : liste sans envoyer.

import crypto from 'node:crypto'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { smtpConfig } from '@/app/lib/mailer'
import { activeCompanyIds, complianceByContact, planRelances, MAX_RELANCES_PAR_PASSAGE } from '@/app/lib/conformite'
import { sendRequest, todayParis } from '@/app/lib/conformiteServer'

export const maxDuration = 60

const log = createLogger('cron-conformite')

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
  if (!dry && !smtpConfig()) {
    return Response.json({ error: 'Envoi par mail non configuré (variables SMTP_*).', code: 'EMAIL_NOT_CONFIGURED' }, { status: 503 })
  }

  try {
    const admin = adminClient()
    const [ch, os, co, cc, docs, reqs] = await Promise.all([
      admin.from('chantiers').select('id, statut'),
      admin.from('ordres_service').select('chantier_id, artisan_nom, statut'),
      admin.from('contacts').select('*'),
      admin.from('contact_chantiers').select('contact_id, chantier_id'),
      admin.from('contact_documents').select('*'),
      admin.from('contact_doc_requests').select('*').order('created_at', { ascending: false }),
    ])
    const failed = [['chantiers', ch], ['ordres_service', os], ['contacts', co], ['contact_chantiers', cc], ['contact_documents', docs], ['contact_doc_requests', reqs]]
      .find(([, r]) => r.error)
    if (failed) {
      if (/does not exist|schema cache/i.test(failed[1].error.message || '')) return Response.json({ ok: true, skipped: 'migration 036 non appliquée' })
      throw new Error(`Chargement ${failed[0]} impossible : ${failed[1].error.message}`)
    }

    const today = todayParis()
    const active = activeCompanyIds({ chantiers: ch.data, ordresService: os.data, contacts: co.data, contactChantiers: cc.data })
    const map = complianceByContact(docs.data || [], today)
    const lastReq = new Map()
    for (const r of reqs.data || []) if (!lastReq.has(r.contact_id)) lastReq.set(r.contact_id, r)

    // Même ordre que l'aperçu de l'écran « Suivi des documents »
    const targets = planRelances({ contacts: co.data || [], byContact: map, lastRequest: lastReq, activeIds: active, today, now: new Date() })
      .slice(0, MAX_RELANCES_PAR_PASSAGE)
      .map(p => p.contact)

    if (dry) return Response.json({ ok: true, dry: true, entreprises: targets.map(c => c.nom) })

    // Le site appelé par GitHub Actions (secret APP_URL) : le lien mène au même site
    const appUrl = url.origin
    let sent = 0
    const errors = []
    for (const contact of targets) {
      const r = await sendRequest(admin, { contact, auto: true, appUrl, log })
      if (r.data?.sent) sent++
      else errors.push(contact.nom)
    }
    return Response.json({ ok: true, sent, failed: errors.length })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
