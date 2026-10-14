// Route /api/cr/actions — page publique /actions/<jeton> : l'entreprise
// répond, point par point, aux actions qui lui sont demandées sur un
// chantier (migration 046).
//
// SANS authentification : l'accès est donné par le jeton du lien envoyé avec
// le compte rendu ou le rappel d'échéance (cr_liens.token, 64 hex, valable
// 60 jours). L'entreprise ne voit que ses propres actions ouvertes.
//   GET  ?t=…                                              → chantier, entreprise, actions
//   POST { t, tacheId, type, date?, commentaire?, photo? } → réponse enregistrée
//
// La réponse est gardée sur la tâche (taches.reponse_entreprise) et
// pré-remplit le compte rendu suivant ; l'équipe est prévenue (cloche + mail).

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { notifyTeam } from '@/app/lib/devisNotify'
import { todayParis } from '@/app/lib/conformiteServer'
import { REPONSES, openActionsFor, parseReponse, reponseText } from '@/app/lib/crReponse'
import { findLien, chantierTasks, savePhoto } from '@/app/lib/crReponseServer'

export const maxDuration = 30

const log = createLogger('cr-actions')
const checkRate = createRateLimiter({ limit: 30, windowMs: 60_000 })
const fail = (error, status = 400) => Response.json({ error }, { status })
const clientIp = (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

export async function GET(request) {
  try {
    if (!checkRate(clientIp(request))) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const admin = adminClient()
    const today = todayParis()
    const found = await findLien(admin, new URL(request.url).searchParams.get('t'), today)
    if (found.error) return fail(found.error, found.status)
    const actions = openActionsFor(await chantierTasks(admin, found.chantier.id), found.lien.entreprise)
    await admin.from('cr_liens').update({ derniere_visite: new Date().toISOString() }).eq('token', found.lien.token)
    return Response.json({
      data: {
        chantier: found.chantier.nom, entreprise: found.lien.entreprise, today,
        choix: REPONSES.map(r => ({ code: r.code, label: r.label })),
        actions: actions.map(a => ({ ...a, reponse: a.reponse ? { type: a.reponse.type, date: a.reponse.date || null, le: a.reponse.le } : null })),
      },
    })
  } catch (err) {
    log.error('lecture', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}

export async function POST(request) {
  try {
    if (!checkRate(clientIp(request))) return fail('Trop de requêtes — réessayez dans une minute.', 429)
    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    const today = todayParis()
    const found = await findLien(admin, body.t, today)
    if (found.error) return fail(found.error, found.status)
    const { lien, chantier } = found
    const tache = openActionsFor(await chantierTasks(admin, chantier.id), lien.entreprise).find(a => a.id === body.tacheId)
    if (!tache) return fail('Cette action n’est plus ouverte.', 404)
    const rep = parseReponse(body, today)
    if (rep.error) return fail(rep.error)

    let photo = null
    if (rep.type === 'fait' && body.photo) {
      const saved = await savePhoto(admin, { chantierId: chantier.id, dataUrl: body.photo, entreprise: lien.entreprise })
      if (saved.error) return fail(saved.error)
      photo = saved.path
    }
    const reponse = {
      type: rep.type, date: rep.date, commentaire: rep.commentaire, photo,
      le: new Date().toISOString(), entreprise: lien.entreprise, nom: lien.nom || null,
    }
    const { error } = await admin.from('taches').update({ reponse_entreprise: reponse }).eq('id', tache.id)
    if (error) throw new Error(error.message)

    const point = `${tache.num ? `n°${tache.num} ` : ''}${tache.titre}`
    await notifyTeam(admin, {
      devisId: tache.id, entityType: 'task', chantierId: chantier.id, targetTab: 'projects',
      title: `💬 ${lien.entreprise} : ${reponseText({ type: rep.type, date: rep.date })}`,
      body: `${chantier.nom} · ${point}${rep.commentaire ? ` · « ${rep.commentaire.slice(0, 120)} »` : ''}`,
      mailLines: [
        `${lien.entreprise} a répondu sur une action du chantier ${chantier.nom}.`, '',
        `Action : ${point}${tache.echeance ? ` (échéance ${tache.echeance.split('-').reverse().join('/')})` : ''}`,
        `Réponse : ${reponseText(reponse)}`,
        photo ? 'Une photo a été jointe (documents du chantier).' : null, '',
        'La réponse sera proposée dans le prochain compte rendu.',
      ],
    }, log)
    return Response.json({ ok: true })
  } catch (err) {
    log.error('enregistrement', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
