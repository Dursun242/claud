// Route /api/devis/reponse — réponse du client à la relance d'un devis
// (page publique /reponse/<jeton>, migration 041).
//
// SANS authentification : l'accès est donné par le jeton du devis
// (crm_devis.track_token, 64 hex) présent dans le mail de relance.
//   GET  ?t=…                              → numéro, objet, choix proposés, dernière réponse
//   POST { t, raison, commentaire }        → enregistre la réponse
//
// Un clic dans le mail ne fait qu'ouvrir la page (les liens peuvent être
// visités par les antivirus des messageries) : la réponse n'est enregistrée
// qu'à la confirmation (POST). À l'enregistrement : événement « reponse »
// sur le devis, relances du devis soldées, prochaine action dans le CRM
// selon la raison, équipe prévenue (cloche + mail).

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { isTrackToken, recordDevisEvent } from '@/app/lib/devisTracking'
import { notifyTeam } from '@/app/lib/devisNotify'
import { closeDevisFollowUps } from '@/app/lib/devisWon'
import { RAISONS, raisonOf, parseReponse, reponseInteraction } from '@/app/lib/devisRelance'

const log = createLogger('devis-reponse')
const checkRate = createRateLimiter({ limit: 30, windowMs: 60_000 })
const fail = (error, status) => Response.json({ error }, { status })
const clientIp = (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

async function findByToken(admin, token) {
  if (!isTrackToken(token)) return null
  const { data } = await admin.from('crm_devis')
    .select('id, numero, objet, statut, statut_signature, opportunite_id').eq('track_token', token).maybeSingle()
  return data || null
}

async function lastReponse(admin, devisId) {
  const { data } = await admin.from('crm_devis_events').select('detail, created_at')
    .eq('devis_id', devisId).eq('kind', 'reponse').order('created_at', { ascending: false }).limit(1)
  const r = data?.[0]
  return r?.detail?.raison ? { raison: r.detail.raison, commentaire: r.detail.commentaire || '', created_at: r.created_at } : null
}

export async function GET(request) {
  try {
    if (!checkRate(clientIp(request) || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const admin = adminClient()
    const devis = await findByToken(admin, new URL(request.url).searchParams.get('t'))
    if (!devis) return fail('Lien invalide ou expiré.', 404)
    return Response.json({
      data: {
        numero: devis.numero, objet: devis.objet || '',
        raisons: RAISONS.map(r => ({ code: r.code, label: r.label })),
        derniere: await lastReponse(admin, devis.id),
      },
    })
  } catch (err) {
    log.error('lecture', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}

export async function POST(request) {
  try {
    const ip = clientIp(request)
    if (!checkRate(ip || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    const devis = await findByToken(admin, body.t)
    if (!devis) return fail('Lien invalide ou expiré.', 404)
    const rep = parseReponse(body)
    if (rep.error) return fail(rep.error, 400)

    const ok = await recordDevisEvent(admin, devis.id, 'reponse', {
      ip, userAgent: request.headers.get('user-agent'), detail: rep, dedup: false, log,
    })
    if (!ok) return fail('Réponse non enregistrée, réessayez dans un instant.', 500)

    const r = raisonOf(rep.raison)
    let oppTitre = ''
    try {
      await closeDevisFollowUps(admin, devis, { log })
      if (devis.opportunite_id) {
        const { data: opp } = await admin.from('crm_opportunites').select('titre, contact_id').eq('id', devis.opportunite_id).maybeSingle()
        oppTitre = opp?.titre || ''
        const { error } = await admin.from('crm_interactions').insert({
          opportunite_id: devis.opportunite_id, contact_id: opp?.contact_id || null,
          ...reponseInteraction({ devis, ...rep, today: todayParis() }),
          date: new Date().toISOString(), action_faite: false, created_by: null,
        })
        if (error) log.warn('interaction', error.message)
      }
    } catch (e) { log.warn('suivi CRM de la réponse', e?.message || e) }

    await notifyTeam(admin, {
      devisId: devis.id,
      title: `💬 Devis ${devis.numero} : ${r.court}`,
      body: [oppTitre || devis.objet, rep.commentaire ? `« ${rep.commentaire.slice(0, 140)} »` : null].filter(Boolean).join(' · '),
      mailLines: [
        'Un client a répondu à la relance de son devis.', '',
        `Devis : ${devis.numero}${devis.objet ? ` — ${devis.objet}` : ''}`,
        oppTitre ? `Affaire : ${oppTitre}` : null,
        `Réponse : ${r.label}`,
        rep.commentaire ? `Précision du client : « ${rep.commentaire} »` : null, '',
        `Prochaine action notée dans le CRM : ${r.suite.action}.`,
      ],
    }, log)

    return Response.json({ ok: true })
  } catch (err) {
    log.error('enregistrement', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
