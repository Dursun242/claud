// Route /api/chiffrage/ia — chiffrage estimatif (DPGF) d'un chantier par l'IA.
//
// Deux actions, réservées au staff (verifyStaff) :
//   - "generer"  : à partir d'une description du projet (+ surface, lots du
//                  chantier, prix tirés des OS de la société), propose un DPGF
//                  complet : lots → postes chiffrés, hypothèses, conseils.
//   - "importer" : remet en forme un texte ou un tableau collé (DPGF existant,
//                  export tableur, échange avec une IA) sans inventer de prix.
//
// La route ne touche pas à la base : le front décide quoi faire du résultat.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { generate, stripJsonFence, providerOrder } from '@/app/lib/ai'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { CHIFFRAGE_AI_SCHEMA, normalizeLots } from '@/app/lib/chiffrage'

export const maxDuration = 60

const log = createLogger('chiffrage-ia')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })

const GENERER_SYSTEM = `Tu es économiste de la construction chez SARL ID MAÎTRISE, maîtrise d'œuvre
au Havre (Normandie). Tu établis le chiffrage estimatif (DPGF) d'un projet, le plus
souvent une maison individuelle ou une rénovation.

Règles :
- "lots" : les corps d'état dans l'ordre du chantier (ex. Terrassement - VRD, Gros œuvre,
  Charpente, Couverture - zinguerie, Menuiseries extérieures, Plâtrerie - isolation,
  Électricité, Plomberie - sanitaires, Chauffage - ventilation, Menuiseries intérieures,
  Carrelage - faïence, Revêtements de sols, Peinture…). Si "lots_chantier" est fourni,
  reprends exactement ces noms de lots et n'en ajoute que s'il en manque un indispensable.
- Chaque lot : 3 à 8 postes, désignations professionnelles courtes, quantités déduites
  de la surface et de la description (métrés plausibles), unité adaptée, prix unitaire
  HT réaliste pour la Normandie (prix d'entreprise, fourniture et pose).
- Si "prix_societe" contient un poste équivalent, reprends son prix : ce sont les prix
  réellement payés par la société.
- Pas de ligne d'aléas, d'honoraires ni de TVA : ils sont calculés à part.
- "surface_m2" : la surface de plancher retenue (0 si inconnue).
- "hypotheses" : 2 à 6 hypothèses de chiffrage à confirmer (niveau de finition, sol,
  mode de chauffage…). "conseils" : 0 à 4 remarques utiles (oubli probable, point
  réglementaire RE2020, étude de sol…). Pas de banalités.`

const IMPORTER_SYSTEM = `Tu remets en forme un chiffrage estimatif (DPGF) collé par l'utilisateur
(texte libre, tableau copié d'un tableur, réponse d'une IA). Règles :
- Reprends fidèlement les lots, postes, quantités, unités et prix unitaires HT présents.
  N'invente aucun prix : si un poste n'a qu'un montant total, mets quantite 1, unite
  "ens" et ce montant en pu_ht ; s'il n'a aucun prix, mets pu_ht 0.
- Ignore les lignes de sous-total, total, TVA, aléas et honoraires.
- Unités : ramène aux unités autorisées (m2 → m², ml, u, ens, forfait…).
- Montants TTC seulement : convertis en HT (TVA indiquée, sinon 20 %) et signale-le
  dans "conseils".
- "surface_m2" : si le texte l'indique, sinon 0. "hypotheses" : celles du texte.
  "conseils" : 0 à 3 remarques sur ce qui semble manquer ou incohérent.`

async function callAI({ system, user, maxTokens }) {
  const r = await generate({
    system, maxTokens, json: CHIFFRAGE_AI_SCHEMA, log,
    timeoutMs: 55_000, maxRetries: 1,
    messages: [{ role: 'user', content: user }],
  })
  if (!r.ok) return { error: r.message, status: r.status }
  if (r.stopReason === 'refusal') return { error: 'Demande refusée par l’IA', status: 422 }
  if (r.stopReason === 'max_tokens') return { error: 'Réponse IA tronquée — découpe le texte ou simplifie la description', status: 502 }
  try {
    return { json: JSON.parse(stripJsonFence(r.text)) }
  } catch {
    log.error('JSON invalide', String(r.text).slice(0, 500))
    return { error: 'Réponse IA illisible', status: 502 }
  }
}

const str = (v, max) => String(v ?? '').slice(0, max)
const list = (v, n) => (Array.isArray(v) ? v : []).map(s => str(s, 400).trim()).filter(Boolean).slice(0, n)

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
    const action = body?.action
    let r

    if (action === 'generer') {
      const description = str(body.description, 6000).trim()
      if (description.length < 10) {
        return Response.json({ error: 'Décris le projet en quelques phrases.' }, { status: 400 })
      }
      const context = {
        chantier: str(body.chantier, 300),
        adresse: str(body.adresse, 300),
        surface_m2: Number(body.surface_m2) || null,
        lots_chantier: (Array.isArray(body.lots) ? body.lots : []).map(l => str(l, 120)).filter(Boolean).slice(0, 30),
        prix_societe: (Array.isArray(body.refs) ? body.refs : []).slice(0, 80),
      }
      r = await callAI({
        system: GENERER_SYSTEM,
        user: `Contexte (JSON) :\n${JSON.stringify(context).slice(0, 20_000)}\n\nProjet à chiffrer :\n${description}`,
        maxTokens: 12000,
      })
    } else if (action === 'importer') {
      const texte = str(body.texte, 40_000).trim()
      if (texte.length < 10) {
        return Response.json({ error: 'Colle le texte ou le tableau à importer.' }, { status: 400 })
      }
      r = await callAI({ system: IMPORTER_SYSTEM, user: `Chiffrage à remettre en forme :\n${texte}`, maxTokens: 16000 })
    } else {
      return Response.json({ error: 'Action inconnue' }, { status: 400 })
    }

    if (r.error) return Response.json({ error: r.error }, { status: r.status })
    const lots = normalizeLots(r.json.lots)
    if (!lots.some(l => l.postes.length)) {
      return Response.json({ error: 'L’IA n’a proposé aucun poste — précise le texte.' }, { status: 422 })
    }
    return Response.json({
      ok: true,
      data: {
        lots,
        surface_m2: Number(r.json.surface_m2) > 0 ? Math.round(Number(r.json.surface_m2)) : null,
        hypotheses: list(r.json.hypotheses, 8),
        conseils: list(r.json.conseils, 5),
      },
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
