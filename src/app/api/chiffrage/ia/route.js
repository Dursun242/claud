// Route /api/chiffrage/ia — chiffrage estimatif (DPGF) d'un chantier par l'IA.
//
// Actions réservées au staff (verifyStaff) :
//   - "generer"      : à partir d'une description du projet (+ surface, métré
//                      relevé sur les plans, lots du chantier, prix tirés des OS
//                      de la société), propose un DPGF complet : lots → postes
//                      chiffrés, hypothèses, conseils.
//   - "importer"     : remet en forme un texte ou un tableau collé (DPGF
//                      existant, export tableur, échange avec une IA) sans
//                      inventer de prix.
//   - "prepare_plan" : URL signée pour déposer un plan (PDF ou photo) dans le
//                      stockage (évite la limite de taille des requêtes).
//   - "metre"        : lecture des plans du permis (PCMI) déposés → résumé du
//                      projet + métré (surfaces, linéaires, menuiseries…) à
//                      vérifier avant le chiffrage. Fichiers effacés une fois lus.
//
// Plans lus par Claude uniquement (PDF). Modèle : ANTHROPIC_PLANS_MODEL si
// défini (lecture plus fine), sinon le modèle par défaut.
// Aucune écriture en base : le front décide quoi faire du résultat.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { generate, stripJsonFence, providerOrder } from '@/app/lib/ai'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { safeFileName, storageName } from '@/app/lib/devisDocuments'
import { CHIFFRAGE_AI_SCHEMA, METRE_AI_SCHEMA, normalizeLots, normalizeMetre } from '@/app/lib/chiffrage'

export const maxDuration = 60

const log = createLogger('chiffrage-ia')
const checkRate = createRateLimiter({ limit: 20, windowMs: 60_000 })

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
- "prix_societe" : prix réellement payés par la société dans ses ordres de service
  (pu_ht = dernier prix, nb = nombre d'OS, min / max = fourchette). Pour un poste
  équivalent, reprends sa désignation, son unité et son dernier prix ; sinon prix du
  marché normand cohérent avec ces références.
- Si "metre_plans" est fourni (relevé sur les plans du permis de construire), les
  quantités doivent en découler (murs, toiture, menuiseries, plancher, cloisons…).
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

const METRE_SYSTEM = `Tu es métreur dans un bureau de maîtrise d'œuvre. On te fournit les pièces d'un
permis de construire de maison individuelle (PCMI : plan de situation, plan de masse,
coupes, notice, façades, plans des niveaux) ou des photos de plans. Fais le métré utile
au chiffrage.

- "projet" : résumé factuel en 5 à 10 lignes (type, niveaux, pièces, garage, matériaux
  et équipements indiqués : murs, isolation, charpente, couverture, menuiseries,
  chauffage, ventilation, assainissement).
- "surface_m2" : surface de plancher (tableau des surfaces ou cartouche ; sinon somme
  des pièces). 0 si illisible.
- "metre" : 10 à 35 lignes, chacune { element, quantite, unite, source }. Par exemple :
  surface de plancher, surface habitable, emprise au sol, garage / annexes, terrasses,
  nombre de niveaux, hauteur sous plafond, périmètre des murs extérieurs (ml), surface
  de murs extérieurs ouvertures déduites (m²), linéaire de fondations (ml), surface de
  dallage (m²), surface de toiture rampants (m², selon pente), longueur d'égouts et de
  faîtage (ml), nombre et surface des menuiseries extérieures, portes de garage,
  linéaire de cloisons (ml), surface de plafonds (m²), surfaces de sols par type
  (carrelage, parquet), surface de faïence, nombre de salles d'eau, WC, cuisine,
  longueur de raccordements (ml) si le plan de masse le permet.
- "source" : d'où vient la valeur (« tableau des surfaces », « cotes plan RDC »,
  « échelle 1/100 », « notice », « estimé »). Une valeur déduite ou approchée est
  marquée « estimé » : n'en invente pas sans le dire.
- "alertes" : pièces manquantes ou illisibles, incohérences, points à vérifier.`

async function callAI({ system, user, content, maxTokens, schema = CHIFFRAGE_AI_SCHEMA, maxRetries = 1, anthropicModel }) {
  const r = await generate({
    system, maxTokens, json: schema, log, anthropicModel,
    timeoutMs: 55_000, maxRetries,
    messages: [{ role: 'user', content: content || user }],
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

// Plans du permis : dépôt direct dans le stockage puis lecture par l'IA
const BUCKET = 'attachments'
const PLAN_PREFIX = 'chiffrage-plans/'
const MAX_PDF = 20 * 1024 * 1024
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_TOTAL = 22 * 1024 * 1024 // requête Claude : 32 Mo une fois en base64
const PLAN_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const planType = (name) => PLAN_TYPES[String(name || '').split('.').pop().toLowerCase()] || null
const UUID = /^[0-9a-f-]{36}$/i
const planDir = (chantierId) => `${PLAN_PREFIX}${chantierId}/`

async function chantierExists(admin, id) {
  if (!UUID.test(String(id || ''))) return false
  const { data } = await admin.from('chantiers').select('id').eq('id', id).maybeSingle()
  return !!data
}

async function preparePlan(body) {
  const admin = adminClient()
  if (!(await chantierExists(admin, body.chantierId))) return { error: 'Chantier introuvable', status: 404 }
  const name = safeFileName(body.name)
  const type = planType(name)
  if (!type) return { error: 'Format accepté : PDF, JPEG, PNG ou WebP.', status: 400 }
  const max = type === 'application/pdf' ? MAX_PDF : MAX_IMAGE
  if (Number(body.size) > max) {
    return { error: `« ${name} » est trop lourd (${type === 'application/pdf' ? '20' : '5'} Mo maximum) : déposer seulement les pièces utiles ou réduire la qualité.`, status: 400 }
  }
  const path = `${planDir(body.chantierId)}${Date.now()}__${storageName(name)}`
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    log.error('URL de dépôt', error?.message || 'jeton absent')
    return { error: 'Dépôt impossible pour le moment, réessayez.', status: 500 }
  }
  return { data: { path, token: data.token, type } }
}

async function readPlans(body) {
  const admin = adminClient()
  if (!(await chantierExists(admin, body.chantierId))) return { error: 'Chantier introuvable', status: 404 }
  const dir = planDir(body.chantierId)
  const paths = (Array.isArray(body.paths) ? body.paths : []).map(String).slice(0, 8)
  if (!paths.length) return { error: 'Déposer au moins un plan.', status: 400 }
  if (paths.some(p => !p.startsWith(dir) || p.includes('..'))) return { error: 'Fichier non autorisé', status: 400 }
  const parts = []
  let total = 0
  for (const path of paths) {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(path)
    if (error || !blob) return { error: 'Plan introuvable : le déposer à nouveau.', status: 404 }
    const buf = Buffer.from(await blob.arrayBuffer())
    total += buf.length
    if (total > MAX_TOTAL) return { error: 'Plans trop lourds au total (22 Mo maximum) : garder les pièces utiles (plans, coupes, façades, notice).', status: 400 }
    const mediaType = planType(path) || 'application/pdf'
    parts.push({ type: mediaType === 'application/pdf' ? 'document' : 'image', mediaType, base64: buf.toString('base64') })
  }
  const notes = str(body.notes, 3000).trim()
  parts.push({ type: 'text', text: `Fais le métré de ce projet.${notes ? `\n\nPrécisions du maître d'œuvre :\n${notes}` : ''}` })
  const r = await callAI({
    system: METRE_SYSTEM, content: parts, schema: METRE_AI_SCHEMA, maxTokens: 5000,
    // Pas de nouvel essai : la lecture d'un PDF peut prendre près d'une minute
    maxRetries: 0,
    anthropicModel: process.env.ANTHROPIC_PLANS_MODEL || undefined,
  })
  if (r.error) return r
  const metre = normalizeMetre(r.json.metre)
  if (!metre.length && !str(r.json.projet, 10).trim()) return { error: 'Plans illisibles par l’IA : essayer un PDF net ou des photos bien cadrées.', status: 422 }
  // Plans lus : fichiers temporaires effacés
  await admin.storage.from(BUCKET).remove(paths).catch(() => {})
  return {
    data: {
      projet: str(r.json.projet, 4000).trim(),
      surface_m2: Number(r.json.surface_m2) > 0 ? Math.round(Number(r.json.surface_m2)) : null,
      metre,
      alertes: (Array.isArray(r.json.alertes) ? r.json.alertes : []).map(a => str(a, 400).trim()).filter(Boolean).slice(0, 8),
    },
  }
}
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

    if (action === 'prepare_plan' || action === 'metre') {
      const out = await (action === 'metre' ? readPlans(body) : preparePlan(body))
      if (out.error) return Response.json({ error: out.error }, { status: out.status })
      return Response.json({ ok: true, data: out.data })
    }

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
        metre_plans: normalizeMetre(body.metre),
        prix_societe: (Array.isArray(body.refs) ? body.refs : []).slice(0, 120),
      }
      r = await callAI({
        system: GENERER_SYSTEM,
        user: `Contexte (JSON) :\n${JSON.stringify(context).slice(0, 30_000)}\n\nProjet à chiffrer :\n${description}`,
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
