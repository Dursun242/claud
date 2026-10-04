// Route /api/chiffrage/ia — chiffrage estimatif (DPGF) d'un chantier par l'IA.
//
// Actions réservées au staff (verifyStaff) :
//   - "generer"      : à partir d'une description du projet (+ surface, métré
//                      relevé sur les plans, lots du chantier, prix tirés des OS
//                      de la société), propose un DPGF complet : lots → postes
//                      chiffrés, hypothèses, conseils.
//   - "importer"     : DPGF au format JSON lu directement (sans IA) ; sinon
//                      texte ou tableau collé (DPGF existant, export tableur,
//                      échange avec une IA) remis en forme sans inventer de prix.
//   - "verifier"     : relecture des prix d'un DPGF (oublis, prix bas / hauts,
//                      quantités, incohérences techniques) avec impact chiffré.
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
import {
  CHIFFRAGE_AI_SCHEMA, METRE_AI_SCHEMA, VERIF_AI_SCHEMA, normalizeLots, normalizeMetre, parseDpgfJson,
  dpgfForAi, chiffrageTotals,
} from '@/app/lib/chiffrage'
import { BAREME_ID_MAITRISE, REGLES_ID_MAITRISE } from '@/app/lib/chiffrageBareme'

export const maxDuration = 60

const log = createLogger('chiffrage-ia')
const checkRate = createRateLimiter({ limit: 20, windowMs: 60_000 })

const GENERER_SYSTEM = `Tu es économiste de la construction chez SARL ID MAÎTRISE, maîtrise d'œuvre
au Havre (Normandie). Tu établis le chiffrage estimatif (DPGF) d'un projet, le plus
souvent une maison individuelle neuve.

Règles :
- "lots" : les lots de travaux dans l'ordre du chantier. Si "lots_chantier" est fourni,
  reprends ces noms de lots et n'en ajoute que s'il en manque un indispensable.
  Pas de lot d'honoraires de maîtrise d'œuvre : il est ajouté à part.
- Chaque lot : 3 à 12 postes, désignations professionnelles courtes, quantités déduites
  de la surface et de la description (métrés plausibles), unité adaptée, prix unitaire
  HT fourniture et pose.
- Prix, par ordre de priorité :
  1. "prix_societe" : prix réellement payés dans les ordres de service (pu_ht = dernier
     prix, nb = nombre d'OS, min / max = fourchette) ;
  2. "prix_fixes_dossiers" : prix fixés par le maître d'œuvre sur ses autres DPGF ;
  3. "bareme_id_maitrise" : barème de référence de la société ;
  4. à défaut, prix du marché normand cohérents avec ces références.
  Pour un poste équivalent, reprends la désignation, l'unité et le prix de la référence.
- Si "metre_plans" est fourni (relevé sur les plans du permis de construire), les
  quantités doivent en découler (murs, toiture, menuiseries, plancher, cloisons…).
- Pas de ligne d'aléas, d'honoraires ni de TVA : ils sont calculés à part.
- "surface_m2" : la surface habitable retenue (0 si inconnue).
- "hypotheses" : 2 à 6 hypothèses de chiffrage à confirmer (fondations sous réserve de
  l'étude de sol, puissances à confirmer par l'étude thermique…). "non_compris" : ce qui
  n'est pas chiffré. "conseils" : 0 à 4 remarques utiles. Pas de banalités.

${REGLES_ID_MAITRISE}`

const IMPORTER_SYSTEM = `Tu remets en forme un chiffrage estimatif (DPGF) collé par l'utilisateur
(texte libre, tableau copié d'un tableur, réponse d'une IA). Règles :
- Reprends fidèlement les lots, postes, quantités, unités et prix unitaires HT présents.
  N'invente aucun prix : si un poste n'a qu'un montant total, mets quantite 1, unite
  "ens" et ce montant en pu_ht ; s'il n'a aucun prix, mets pu_ht 0.
- Ignore les lignes de sous-total, total, TVA, aléas et honoraires.
- Unités : ramène aux unités autorisées (m2 → m², ml, u, ens, forfait…).
- Montants TTC seulement : convertis en HT (TVA indiquée, sinon 20 %) et signale-le
  dans "conseils".
- Un lot d'honoraires de maîtrise d'œuvre est repris comme un lot normal.
- "surface_m2" : surface habitable si le texte l'indique, sinon 0. "hypotheses" et
  "non_compris" : ceux du texte. "conseils" : 0 à 3 remarques sur ce qui semble manquer
  ou incohérent.`

const VERIFIER_SYSTEM = `Tu es économiste de la construction et tu relis, pour le maître d'œuvre de
SARL ID MAÎTRISE (Le Havre), le DPGF d'une maison individuelle avant envoi au client.
Dis franchement ce qui ne va pas, comme un confrère :
- oublis (ouvrage nécessaire non chiffré, ex. dalle de toiture, acrotères, escalier,
  garde-corps, raccordements, Consuel), avec un ordre de grandeur ;
- prix trop bas ou trop hauts par rapport aux références ("prix_societe" payés dans les
  OS, "bareme_id_maitrise") et au marché normand ;
- quantités incohérentes avec les surfaces (peinture ≈ 2,5 à 3 fois la surface habitable
  en murs, carrelage + parquet ≈ surface habitable, plancher chauffant ≈ surface
  chauffée…) ;
- incohérences techniques (puissances de chauffage / climatisation, doubles comptes
  entre lots, poste au mauvais lot).
Les postes "verrou" ont un prix fixé par le maître d'œuvre : ne demande pas de les
changer, sauf erreur manifeste à signaler comme "info". Les honoraires ne se discutent pas.
"remarques" : 3 à 12, les plus importantes d'abord ; "poste" = numéro (ex. "4.9") ou ""
pour un oubli ; "impact_ht" = effet estimé sur le total HT (positif si ça augmente,
0 si sans effet). "synthese" : 2 à 4 phrases (niveau global, ratio, verdict).

${REGLES_ID_MAITRISE}`

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

// Prix verrouillés par le maître d'œuvre sur ses autres DPGF (référence vivante)
async function prixFixesDossiers(exceptChantierId) {
  try {
    const { data, error } = await adminClient().from('chantier_chiffrages').select('chantier_id, lots, updated_at').order('updated_at', { ascending: false }).limit(30)
    if (error || !data) return []
    const out = []
    const seen = new Set()
    for (const c of data) {
      if (c.chantier_id === exceptChantierId) continue
      for (const l of normalizeLots(c.lots)) {
        if (l.honoraires) continue
        for (const p of l.postes) {
          const k = `${p.designation.toLowerCase()}|${p.unite}`
          if (!p.verrou || seen.has(k)) continue
          seen.add(k)
          out.push({ lot: l.nom, designation: p.designation, unite: p.unite, pu_ht: p.pu_ht })
        }
      }
    }
    return out.slice(0, 80)
  } catch {
    return []
  }
}

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
        prix_fixes_dossiers: await prixFixesDossiers(body.chantierId),
        bareme_id_maitrise: BAREME_ID_MAITRISE,
      }
      r = await callAI({
        system: GENERER_SYSTEM,
        user: `Contexte (JSON) :\n${JSON.stringify(context).slice(0, 40_000)}\n\nProjet à chiffrer :\n${description}`,
        maxTokens: 12000,
      })
    } else if (action === 'importer') {
      const texte = str(body.texte, 200_000).trim()
      if (texte.length < 10) {
        return Response.json({ error: 'Colle le texte ou le tableau à importer.' }, { status: 400 })
      }
      // DPGF au format JSON : repris tel quel, sans IA
      const parsed = parseDpgfJson(texte)
      if (parsed) return Response.json({ ok: true, data: { ...parsed, hypotheses: [], non_compris: [], conseils: [], direct: true } })
      if (texte.length > 40_000) {
        return Response.json({ error: 'Texte trop long pour l’IA (40 000 caractères) : importer lot par lot.' }, { status: 400 })
      }
      r = await callAI({ system: IMPORTER_SYSTEM, user: `Chiffrage à remettre en forme :\n${texte}`, maxTokens: 16000 })
    } else if (action === 'verifier') {
      const lots = normalizeLots(body.lots)
      if (!lots.some(l => l.postes.length)) return Response.json({ error: 'DPGF vide.' }, { status: 400 })
      const totals = chiffrageTotals({ lots, aleas_pct: body.aleas_pct, tva_pct: body.tva_pct, surface_m2: body.surface_m2, surface_annexes: body.surface_annexes })
      const context = {
        chantier: str(body.chantier, 300),
        description: str(body.description, 3000),
        surface_habitable_m2: Number(body.surface_m2) || null,
        annexes_garage_m2: Number(body.surface_annexes) || null,
        totaux: totals,
        dpgf: dpgfForAi(lots),
        prix_societe: (Array.isArray(body.refs) ? body.refs : []).slice(0, 120),
        bareme_id_maitrise: BAREME_ID_MAITRISE,
      }
      const v = await callAI({
        system: VERIFIER_SYSTEM, schema: VERIF_AI_SCHEMA, maxTokens: 5000,
        user: `DPGF à relire (JSON) :\n${JSON.stringify(context).slice(0, 60_000)}`,
      })
      if (v.error) return Response.json({ error: v.error }, { status: v.status })
      const types = new Set(['oubli', 'prix_bas', 'prix_haut', 'quantite', 'incoherence', 'info'])
      return Response.json({
        ok: true,
        data: {
          synthese: str(v.json.synthese, 1500).trim(),
          remarques: (Array.isArray(v.json.remarques) ? v.json.remarques : []).slice(0, 15).map(x => ({
            type: types.has(x?.type) ? x.type : 'info',
            poste: str(x?.poste, 12).trim(),
            message: str(x?.message, 600).trim(),
            impact_ht: Math.round(Number(x?.impact_ht) || 0),
          })).filter(x => x.message),
        },
      })
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
        non_compris: list(r.json.non_compris, 15),
        conseils: list(r.json.conseils, 5),
      },
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
