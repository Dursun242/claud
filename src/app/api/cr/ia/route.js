// Route /api/cr/ia — dictée de réunion → compte rendu structuré.
//
// À partir des notes dictées (ou tapées) pendant la réunion et du contexte
// du CR (lots + entreprises, points ouverts), l'IA propose : un résumé, les
// observations et l'avancement de chaque lot, l'état des points existants
// (fait / en cours / à relancer), les nouveaux points (lot, entreprise,
// échéance, priorité) et les décisions. L'utilisateur valide avant que
// quoi que ce soit ne soit appliqué au CR. Réservée au staff.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { generate, stripJsonFence, providerOrder } from '@/app/lib/ai'
import { CR_AI_SCHEMA, normalizeCrAi, str, isoDateOrNull as date } from '@/app/lib/crAi'

export const maxDuration = 60

const log = createLogger('cr-ia')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })

const SYSTEM = `Tu es l'assistant de SARL ID MAÎTRISE, maître d'œuvre au Havre. Tu
transformes les notes d'une réunion de chantier (souvent dictées : phrases
orales, fautes de reconnaissance vocale) en compte rendu structuré, en français
professionnel, concis et factuel.

Tu reçois le contexte (date de la réunion, lots du chantier avec leur
entreprise, points ouverts avec leur id) puis les notes. Réponds en JSON :
- "resume" : synthèse générale de la réunion en 2 à 5 phrases ("" si rien).
- "lots" : pour chaque lot évoqué, "observations" (constats, état d'avancement,
  remarques, sans répéter les actions) et "avancement" (pourcentage entier si
  un chiffre est donné, sinon null). Utilise le nom de lot du contexte le plus
  proche ; "Généralités" pour planning, sécurité, administratif, propreté.
- "points_existants" : uniquement les points du contexte dont les notes
  parlent : "fait" (terminé, levé, réalisé), "en_cours" (en cours, dans les
  temps), "relance" (pas fait, en retard, à relancer). "echeance" : nouvelle
  date AAAA-MM-JJ si un report est annoncé, sinon null. Ne devine pas.
- "nouveaux_points" : actions nouvelles à mener, une par ligne, formulées à
  l'infinitif ("Fournir…", "Reprendre…"), avec le lot, l'entreprise
  responsable (nom du contexte si possible, sinon tel que dit, ou ""),
  l'échéance AAAA-MM-JJ (déduite de « vendredi », « semaine prochaine »… par
  rapport à la date de réunion, sinon null) et la priorité ("Urgent" si
  urgent / sécurité / bloquant, "En attente" si secondaire, sinon "En cours").
  Ne recrée pas un point déjà présent dans le contexte.
- "decisions" : décisions prises, une par ligne ("" si aucune).
N'invente rien qui ne soit pas dans les notes.`

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) {
      return Response.json({ error: 'Trop de requêtes — attendez 1 minute.' }, { status: 429 })
    }
    const { user, status } = await verifyStaff(request)
    if (!user) {
      return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
    }
    if (!providerOrder().length) {
      log.error('aucune clé IA (ANTHROPIC_API_KEY / MISTRAL_API_KEY)')
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const notes = str(body.notes, 20_000)
    if (notes.length < 10) return Response.json({ error: 'Dicte ou écris d’abord les notes de la réunion.' }, { status: 400 })
    const lots = (Array.isArray(body.context?.lots) ? body.context.lots : []).slice(0, 40)
      .map(l => ({ lot: str(l?.lot, 120), entreprise: str(l?.entreprise, 120) })).filter(l => l.lot)
    const points = (Array.isArray(body.context?.points) ? body.context.points : []).slice(0, 200)
      .map(p => ({
        id: str(p?.id, 64), num: Number(p?.num) || null, lot: str(p?.lot, 120), titre: str(p?.titre, 300),
        entreprise: str(p?.entreprise, 120), echeance: date(p?.echeance), etat: str(p?.etat, 20),
      })).filter(p => p.id)
    const meetingDate = date(body.date) || new Date().toISOString().slice(0, 10)

    const r = await generate({
      system: SYSTEM, json: CR_AI_SCHEMA, maxTokens: 6000, log, timeoutMs: 55_000, maxRetries: 1,
      messages: [{
        role: 'user',
        content: `CONTEXTE\n${JSON.stringify({ date_reunion: meetingDate, lots, points })}\n\nNOTES DE RÉUNION\n${notes}`,
      }],
    })
    if (!r.ok) return Response.json({ error: r.message }, { status: r.status })
    if (r.stopReason === 'max_tokens') return Response.json({ error: 'Réponse IA tronquée — découpe les notes en plusieurs fois.' }, { status: 502 })
    let json
    try {
      json = JSON.parse(stripJsonFence(r.text))
    } catch {
      log.error('JSON invalide', String(r.text).slice(0, 500))
      return Response.json({ error: 'Réponse IA illisible — réessaie.' }, { status: 502 })
    }
    return Response.json({ ok: true, data: normalizeCrAi(json, points.map(p => p.id)), provider: r.provider })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
