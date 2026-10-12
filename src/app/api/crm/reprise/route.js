// Route /api/crm/reprise — réponse du client au mail de reprise de contact
// d'une affaire en attente (page publique /reprise/<jeton>, migration 044).
//
// SANS authentification : l'accès est donné par le jeton de l'affaire
// (crm_opportunites.reprise_token, 64 hex) présent dans le mail.
//   GET  ?t=…                         → motif de la pause, choix proposés
//   POST { t, choix, commentaire }    → enregistre la réponse
//
// Un clic dans le mail ne fait qu'ouvrir la page (les liens peuvent être
// visités par les antivirus des messageries) : la réponse n'est enregistrée
// qu'à la confirmation (POST). À l'enregistrement (lib/crmReprise.repriseSuite) :
// le projet redémarre → l'affaire repart dans le pipeline ; toujours en
// pause → nouvelle date de reprise ; abandonné → affaire perdue ; échange
// noté avec la prochaine action, équipe prévenue (cloche + mail).

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { notifyTeam } from '@/app/lib/devisNotify'
import { todayParis } from '@/app/lib/conformiteServer'
import { CHOIX_REPRISE, choixOf, parseReprise, repriseSuite } from '@/app/lib/crmReprise'
import { closeRepriseFollowUps } from '@/app/lib/crmRepriseServer'

const log = createLogger('crm-reprise')
const checkRate = createRateLimiter({ limit: 30, windowMs: 60_000 })
const fail = (error, status) => Response.json({ error }, { status })
const clientIp = (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
const isToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)

async function findByToken(admin, token) {
  if (!isToken(token)) return null
  const { data } = await admin.from('crm_opportunites')
    .select('id, titre, etape, contact_id, motif_attente, date_reprise').eq('reprise_token', token).maybeSingle()
  return data || null
}

export async function GET(request) {
  try {
    if (!checkRate(clientIp(request) || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const admin = adminClient()
    const opp = await findByToken(admin, new URL(request.url).searchParams.get('t'))
    if (!opp) return fail('Lien invalide ou expiré.', 404)
    return Response.json({
      data: {
        motif: opp.motif_attente || '',
        choix: CHOIX_REPRISE.map(c => ({ code: c.code, label: c.label })),
      },
    })
  } catch (err) {
    log.error('lecture', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}

export async function POST(request) {
  try {
    if (!checkRate(clientIp(request) || 'unknown')) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    const opp = await findByToken(admin, body.t)
    if (!opp) return fail('Lien invalide ou expiré.', 404)
    const rep = parseReprise(body)
    if (rep.error) return fail(rep.error, 400)

    const today = todayParis()
    const { count } = await admin.from('crm_devis').select('id', { count: 'exact', head: true }).eq('opportunite_id', opp.id)
    const suite = repriseSuite({ opp, ...rep, aDesDevis: (count || 0) > 0, today })

    if (suite.patch) {
      const { error } = await admin.from('crm_opportunites').update(suite.patch).eq('id', opp.id)
      if (error) throw new Error(error.message)
    }
    await closeRepriseFollowUps(admin, opp.id, suite.closeFollowUps, log)
    const { error: iErr } = await admin.from('crm_interactions').insert({
      opportunite_id: opp.id, contact_id: opp.contact_id || null, ...suite.interaction,
      date: new Date().toISOString(), action_faite: false, created_by: null,
    })
    if (iErr) log.warn('échange', iErr.message)

    const c = choixOf(rep.choix)
    await notifyTeam(admin, {
      devisId: opp.id,
      title: `💬 Affaire en attente : ${c.court}`,
      body: [opp.titre, rep.commentaire ? `« ${rep.commentaire.slice(0, 140)} »` : null].filter(Boolean).join(' · '),
      mailLines: [
        'Un client a répondu au mail de reprise de contact de son affaire en attente.', '',
        `Affaire : ${opp.titre}`,
        `Réponse : ${c.code === 'autre' ? 'Autre' : c.label}`,
        rep.commentaire ? `Précision du client : « ${rep.commentaire} »` : null, '',
        suite.resume || null,
        suite.interaction.prochaine_action ? `Prochaine action notée dans le CRM : ${suite.interaction.prochaine_action}.` : null,
      ],
    }, log)

    return Response.json({ ok: true })
  } catch (err) {
    log.error('enregistrement', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
