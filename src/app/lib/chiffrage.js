// Chiffrage estimatif (DPGF) d'un chantier : lots → postes, totaux, aléas,
// comparaison avec la réalité (ordres de service rattachés à un lot),
// contrôles de bon sens et rattachement automatique d'un OS à un lot.
// Logique pure (ni React ni Supabase). Tests : __tests__/chiffrage.test.js.
//
// Montants HT. Lots : { id, nom, honoraires?, postes }. Postes :
// { id, designation, quantite, unite, pu_ht, verrou? }.
//   - honoraires : lot des honoraires de maîtrise d'œuvre (compté dans le
//     total de l'opération et le ratio, pas dans les travaux ni les OS) ;
//   - verrou : prix fixé par le maître d'œuvre, jamais modifié par un calage.
// Surfaces : SHAB (surface_m2) + annexes / garage (surface_annexes) comptées
// pour moitié → surface de référence du ratio TTC/m² (MOE comprise).

export const UNITES = ['u', 'Ft', 'ens', 'm²', 'm³', 'ml', 'm', 'kg', 'h', 'j', 'mois', 'forfait']

const num = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round(n * 100) / 100
let seq = 0
export const newId = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** Lots propres : identifiants, nombres, chaînes nettoyées ; lots vides retirés. */
export function normalizeLots(lots = []) {
  return (Array.isArray(lots) ? lots : [])
    .map(l => ({
      id: l?.id || newId('l'),
      nom: String(l?.nom || '').trim().slice(0, 120),
      ...(l?.honoraires ? { honoraires: true } : {}),
      postes: (Array.isArray(l?.postes) ? l.postes : []).map(p => ({
        id: p?.id || newId('p'),
        designation: String(p?.designation || '').trim().slice(0, 300),
        quantite: num(p?.quantite),
        unite: String(p?.unite || 'u').trim().slice(0, 12) || 'u',
        pu_ht: round2(num(p?.pu_ht)),
        ...(p?.verrou ? { verrou: true } : {}),
      })).filter(p => p.designation || p.pu_ht),
    }))
    .filter(l => l.nom || l.postes.length)
}

export const posteTotal = (p) => round2(num(p?.quantite) * num(p?.pu_ht))
export const lotTotal = (l) => round2((l?.postes || []).reduce((s, p) => s + posteTotal(p), 0))
const travauxLots = (lots) => lots.filter(l => !l.honoraires)

/** Numéros affichés : lot « 04 », poste « 4.5 ». */
export const lotNumero = (i) => String(i + 1).padStart(2, '0')
export const posteNumero = (i, j) => `${i + 1}.${j + 1}`

/** Surface de référence du ratio : SHAB + annexes (garage) pour moitié. */
export const surfaceRef = (surface_m2, surface_annexes) => {
  const s = num(surface_m2) + num(surface_annexes) / 2
  return s > 0 ? round2(s) : null
}

/**
 * Totaux : travaux HT (hors honoraires), aléas, honoraires, total HT de
 * l'opération, TVA, TTC (MOE comprise), travaux TTC, ratio TTC/m² MOE
 * comprise sur la surface de référence.
 */
export function chiffrageTotals({ lots = [], aleas_pct = 0, tva_pct = 20, surface_m2 = null, surface_annexes = null } = {}) {
  const t = 1 + num(tva_pct) / 100
  const ht = round2(travauxLots(lots).reduce((s, l) => s + lotTotal(l), 0))
  const aleas = round2(ht * num(aleas_pct) / 100)
  const htAleas = round2(ht + aleas)
  const honoraires = round2(lots.filter(l => l.honoraires).reduce((s, l) => s + lotTotal(l), 0))
  const totalHt = round2(htAleas + honoraires)
  const tva = round2(totalHt * (t - 1))
  const ttc = round2(totalHt + tva)
  const ref = surfaceRef(surface_m2, surface_annexes)
  return {
    ht, aleas, htAleas, honoraires, totalHt, tva, ttc,
    travauxTtc: round2(htAleas * t),
    surfaceRef: ref,
    ratioTtc: ref ? Math.round(ttc / ref) : null,
    ratioTravauxTtc: ref ? Math.round((htAleas * t) / ref) : null,
  }
}

/**
 * Calage sur un objectif TTC : les prix unitaires des postes de travaux non
 * verrouillés sont ajustés dans la même proportion (arrondis : 1 € au-dessus
 * de 10 €, 0,10 € en dessous). Honoraires et prix verrouillés inchangés.
 * `avecHonoraires` : l'objectif inclut les honoraires (total de l'opération).
 * @returns {{ lots, atteint: number, ecart: number } | { error: string }}
 */
export function calerSurObjectif({ lots = [], aleas_pct = 0, tva_pct = 20, cible_ttc, avecHonoraires = false }) {
  const t = 1 + num(tva_pct) / 100
  const cur = chiffrageTotals({ lots, aleas_pct, tva_pct })
  const cibleHt = num(cible_ttc) / t - (avecHonoraires ? cur.honoraires : 0)
  const cibleTravaux = cibleHt / (1 + num(aleas_pct) / 100)
  let fixe = 0, libre = 0
  for (const l of travauxLots(lots)) for (const p of l.postes) (p.verrou ? (fixe += posteTotal(p)) : (libre += posteTotal(p)))
  if (!(num(cible_ttc) > 0)) return { error: 'Indiquer un objectif TTC.' }
  if (libre <= 0) return { error: 'Aucun prix modifiable : tous les postes sont verrouillés ou sans prix.' }
  const f = (cibleTravaux - fixe) / libre
  if (f <= 0.2) return { error: 'Objectif inatteignable : les postes verrouillés (et les honoraires) le dépassent presque à eux seuls.' }
  const arrondi = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
  const out = lots.map(l => l.honoraires ? l : ({
    ...l,
    postes: l.postes.map(p => (p.verrou || !num(p.pu_ht) ? p : { ...p, pu_ht: arrondi(num(p.pu_ht) * f) })),
  }))
  const after = chiffrageTotals({ lots: out, aleas_pct, tva_pct })
  const atteint = avecHonoraires ? after.ttc : after.travauxTtc
  return { lots: out, atteint, ecart: round2(atteint - num(cible_ttc)), facteur: Math.round(f * 1000) / 1000 }
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe')

// Métier de l'artisan → mots qu'on retrouve dans le nom du lot
const METIERS = [
  [/plomb|sanitaire/, ['plomberie', 'sanitaire']],
  [/electri|cfo|cfa/, ['electricite', 'electrique', 'courants']],
  [/chauff|clim|vmc|ventil|pompe a chaleur|pac\b|genie climatique/, ['chauffage', 'ventilation', 'vmc', 'climatisation', 'genie climatique']],
  [/macon|gros.?oeuvre|beton/, ['maconnerie', 'gros oeuvre', 'gros-oeuvre', 'fondations']],
  [/terrass|vrd|assainiss/, ['terrassement', 'vrd', 'assainissement', 'reseaux']],
  [/charpent/, ['charpente']],
  [/couvr|zingu|toitur/, ['couverture', 'zinguerie', 'toiture']],
  [/menuis|vitr|fenetre/, ['menuiserie', 'menuiseries']],
  [/plaqu|platr|cloison|isol|doublage/, ['platrerie', 'cloisons', 'doublages', 'isolation', 'plafonds']],
  [/carrel|faienc/, ['carrelage', 'faience']],
  [/peint|ravale|enduit/, ['peinture', 'ravalement', 'enduits', 'facade']],
  [/sol|parquet|moquet/, ['revetements de sols', 'sols', 'parquet']],
  [/etanch/, ['etancheite']],
  [/serrur|metall/, ['serrurerie', 'metallerie']],
  [/cuisin/, ['cuisine']],
  [/paysag|espaces? vert|jardin/, ['espaces verts', 'amenagements exterieurs']],
]

/** Lot le plus probable pour un artisan (spécialité). `lots` : objets { nom } ou noms. */
export function suggestLot(specialite, lots = []) {
  const s = fold(specialite)
  if (!s || !lots.length) return null
  const noms = lots.map(l => typeof l === 'string' ? l : l?.nom).filter(Boolean).map(nom => ({ nom, f: fold(nom) }))
  const direct = noms.find(l => l.f && (l.f.includes(s) || s.includes(l.f)))
  if (direct) return direct.nom
  for (const [re, mots] of METIERS) {
    if (!re.test(s)) continue
    const hit = noms.find(l => mots.some(m => l.f.includes(m)))
    if (hit) return hit.nom
  }
  return null
}

const ENGAGE = (o) => o.statut !== 'Brouillon' && o.statut !== 'Annulé'
// Montant HT d'un OS ; OS saisi en TTC seul (saisie rapide) : HT déduit (TVA 20 %)
export const osHT = (o) => {
  const ht = num(o?.montant_ht)
  if (ht) return ht
  const ttc = num(o?.montant_ttc)
  return o?.tva_non_applicable ? ttc : round2(ttc / 1.2)
}

/** Lots proposés pour un OS : ceux du chiffrage, sinon ceux du chantier. */
export function lotOptions(chiffrage, chantier) {
  const fromChiffrage = (chiffrage?.lots || []).map(l => l.nom).filter(Boolean)
  return fromChiffrage.length ? fromChiffrage : (chantier?.lots || []).filter(Boolean)
}

/**
 * Estimé / réel par lot. Réel = OS engagés (hors brouillon et annulé),
 * montant HT, rattachés au lot (champ lot de l'OS, même nom de lot).
 * @returns {{ lignes: Array<{nom, estime, engage, brouillon, ecart, pct, nbOs}>, sansLot: {engage, nb, os}, totaux }}
 */
export function compareWithOs({ lots = [], os = [], aleas_pct = 0 } = {}) {
  const key = (s) => fold(s).trim()
  const byLot = new Map()
  const sansLot = { engage: 0, brouillon: 0, nb: 0, os: [] }
  for (const o of os) {
    if (o.statut === 'Annulé') continue
    const k = key(o.lot)
    const m = osHT(o)
    if (!k) {
      sansLot.os.push(o)
      if (ENGAGE(o)) { sansLot.engage += m; sansLot.nb += 1 } else sansLot.brouillon += m
      continue
    }
    if (!byLot.has(k)) byLot.set(k, { engage: 0, brouillon: 0, nbOs: 0, nom: o.lot })
    const b = byLot.get(k)
    if (ENGAGE(o)) { b.engage += m; b.nbOs += 1 } else b.brouillon += m
  }
  const travaux = travauxLots(lots)
  const lignes = travaux.map(l => {
    const b = byLot.get(key(l.nom)) || { engage: 0, brouillon: 0, nbOs: 0 }
    byLot.delete(key(l.nom))
    const estime = lotTotal(l)
    return { nom: l.nom, estime, engage: round2(b.engage), brouillon: round2(b.brouillon), nbOs: b.nbOs, ecart: round2(b.engage - estime), pct: estime > 0 ? Math.round((b.engage / estime) * 100) : null }
  })
  // OS rattachés à un lot absent du chiffrage
  for (const b of byLot.values()) {
    lignes.push({ nom: b.nom, estime: 0, engage: round2(b.engage), brouillon: round2(b.brouillon), nbOs: b.nbOs, ecart: round2(b.engage), pct: null, horsChiffrage: true })
  }
  const estime = round2(travaux.reduce((s, l) => s + lotTotal(l), 0))
  const engage = round2(lignes.reduce((s, l) => s + l.engage, 0) + sansLot.engage)
  const budget = round2(estime * (1 + num(aleas_pct) / 100))
  return {
    lignes,
    sansLot: { ...sansLot, engage: round2(sansLot.engage), brouillon: round2(sansLot.brouillon) },
    totaux: { estime, budget, engage, ecart: round2(engage - budget), pct: budget > 0 ? Math.round((engage / budget) * 100) : null },
  }
}

const fmtE = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`

/**
 * Contrôles de bon sens (avertissements, rien de bloquant) : postes sans
 * prix ou sans quantité, doublons, poids d'un lot anormal, coût des travaux
 * au m² de surface de référence hors fourchette (900 à 3 500 € HT/m²).
 */
export function sanityChecks({ lots = [], surface_m2 = null, surface_annexes = null, aleas_pct = 0 } = {}) {
  const out = []
  const travaux = travauxLots(lots)
  const total = travaux.reduce((s, l) => s + lotTotal(l), 0)
  for (const l of lots) {
    const sansPrix = l.postes.filter(p => !num(p.pu_ht)).length
    const sansQte = l.postes.filter(p => num(p.pu_ht) && !num(p.quantite)).length
    if (!l.postes.length) out.push(`Lot « ${l.nom} » sans poste.`)
    if (sansPrix) out.push(`Lot « ${l.nom} » : ${sansPrix} poste${sansPrix > 1 ? 's' : ''} sans prix unitaire.`)
    if (sansQte) out.push(`Lot « ${l.nom} » : ${sansQte} poste${sansQte > 1 ? 's' : ''} sans quantité.`)
    const seen = new Set()
    for (const p of l.postes) {
      const k = fold(p.designation)
      if (k && seen.has(k)) out.push(`Lot « ${l.nom} » : poste en double « ${p.designation} ».`)
      seen.add(k)
    }
    const part = total > 0 && !l.honoraires ? lotTotal(l) / total : 0
    if (travaux.length >= 4 && part > 0.45) out.push(`Lot « ${l.nom} » : ${Math.round(part * 100)} % des travaux, poids inhabituel.`)
  }
  const ref = surfaceRef(surface_m2, surface_annexes)
  if (ref && total > 0) {
    const m2 = total * (1 + num(aleas_pct) / 100) / ref
    if (m2 < 900) out.push(`Travaux à ${fmtE(m2)} HT/m² : bas pour une construction neuve (souvent 1 300 à 2 000 € HT/m²). Un lot manque-t-il ?`)
    if (m2 > 3500) out.push(`Travaux à ${fmtE(m2)} HT/m² : élevé pour une maison individuelle. Vérifier quantités et prix.`)
  }
  return out
}

/**
 * Prix de référence de la société, tirés des OS passés (prix du marché
 * réellement payés) : [{ designation, unite, pu_ht, nb, min, max, metier }].
 * Un poste par désignation + unité : dernier prix, nombre d'OS, fourchette ;
 * les plus récents d'abord.
 */
export function osPriceRefs(os = [], max = 120) {
  const byKey = new Map()
  const sorted = [...os]
    .filter(o => o?.statut !== 'Annulé')
    .sort((a, b) => String(b.date_emission || b.created_at || '').localeCompare(String(a.date_emission || a.created_at || '')))
  for (const o of sorted) {
    for (const p of o.prestations || []) {
      const designation = String(p.description || '').trim()
      const pu = round2(num(p.prix_unitaire))
      if (!designation || !pu) continue
      const k = `${fold(designation)}|${fold(p.unite)}`
      const r = byKey.get(k)
      if (r) { r.nb += 1; r.min = Math.min(r.min, pu); r.max = Math.max(r.max, pu); continue }
      byKey.set(k, { designation: designation.slice(0, 140), unite: p.unite || 'u', pu_ht: pu, nb: 1, min: pu, max: pu, metier: o.artisan_specialite || o.lot || '' })
    }
  }
  return [...byKey.values()].slice(0, max)
}

/**
 * Index des prix des OS pour l'éditeur : (désignation, unité) → référence.
 * `refFor(index, poste)` renvoie la référence d'un poste, ou null.
 */
export const refsIndex = (refs = []) => new Map(refs.map(r => [`${fold(r.designation).trim()}|${fold(r.unite)}`, r]))
export const refFor = (index, p) => index.get(`${fold(p?.designation).trim()}|${fold(p?.unite)}`) || null

/** Métré relevé sur les plans (PCMI) par l'IA : lignes propres. */
export function normalizeMetre(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(r => ({
    element: String(r?.element || '').trim().slice(0, 160),
    quantite: round2(num(r?.quantite)),
    unite: String(r?.unite || '').trim().slice(0, 12),
    source: String(r?.source || '').trim().slice(0, 120),
  })).filter(r => r.element).slice(0, 60)
}

/** Schéma JSON demandé à l'IA pour la lecture des plans. */
export const METRE_AI_SCHEMA = {
  type: 'object',
  properties: {
    projet: { type: 'string' },
    surface_m2: { type: 'number' },
    metre: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          element: { type: 'string' },
          quantite: { type: 'number' },
          unite: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['element', 'quantite', 'unite', 'source'],
        additionalProperties: false,
      },
    },
    alertes: { type: 'array', items: { type: 'string' } },
  },
  required: ['projet', 'surface_m2', 'metre', 'alertes'],
  additionalProperties: false,
}

/** Schéma JSON demandé à l'IA (génération et import). */
export const CHIFFRAGE_AI_SCHEMA = {
  type: 'object',
  properties: {
    lots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          postes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                designation: { type: 'string' },
                quantite: { type: 'number' },
                unite: { type: 'string', enum: UNITES },
                pu_ht: { type: 'number' },
              },
              required: ['designation', 'quantite', 'unite', 'pu_ht'],
              additionalProperties: false,
            },
          },
        },
        required: ['nom', 'postes'],
        additionalProperties: false,
      },
    },
    surface_m2: { type: 'number' },
    hypotheses: { type: 'array', items: { type: 'string' } },
    non_compris: { type: 'array', items: { type: 'string' } },
    conseils: { type: 'array', items: { type: 'string' } },
  },
  required: ['lots', 'surface_m2', 'hypotheses', 'non_compris', 'conseils'],
  additionalProperties: false,
}

const splitReference = (ref) => {
  const m = String(ref).match(/^(.*?)[\s,·-]*\bind(?:ice)?\.?\s*([A-Z0-9]{1,3})\s*$/i)
  return m && m[1].trim() ? { reference: m[1].trim().slice(0, 80), indice: m[2].toUpperCase() } : { reference: String(ref).trim().slice(0, 80) }
}

const HONORAIRES_RE = /honoraires|ma[iî]trise d.?(œ|oe)uvre|\bmoe\b/i

/**
 * DPGF au format JSON (export d'une conversation, d'un autre outil…) :
 * cherche la première liste de lots avec postes, à n'importe quel niveau.
 * Lot : nom | intitule | titre ; poste : designation | libelle, quantite |
 * qte, unite | u, pu_ht | prix_unitaire. Reprend aussi, s'ils existent,
 * surfaces, référence et observations. Sans IA, rien n'est inventé.
 * @returns {null | { lots, surface_m2?, surface_annexes?, reference?, indice?, observations? }}
 */
export function parseDpgfJson(text) {
  let root
  try { root = JSON.parse(String(text || '').trim()) } catch { return null }
  const isLots = (v) => Array.isArray(v) && v.length && v.every(l => l && typeof l === 'object' && Array.isArray(l.postes))
  let found = null
  const seen = new Set()
  const walk = (o, depth) => {
    if (found || !o || typeof o !== 'object' || depth > 8 || seen.has(o)) return
    seen.add(o)
    if (isLots(o.lots)) { found = o; return }
    for (const v of Object.values(o)) walk(v, depth + 1)
  }
  walk(isLots(root) ? { lots: root } : root, 0)
  if (!found) return null
  const lots = normalizeLots(found.lots.map(l => {
    const nom = l.nom || l.intitule || l.titre || ''
    return {
      nom,
      ...(l.honoraires || HONORAIRES_RE.test(nom) ? { honoraires: true } : {}),
      postes: l.postes.map(p => ({
        designation: p.designation || p.libelle || p.description || '',
        quantite: p.quantite ?? p.qte ?? 1,
        unite: p.unite || p.u || 'u',
        pu_ht: p.pu_ht ?? p.prix_unitaire ?? p.pu ?? 0,
        ...(p.verrou ? { verrou: true } : {}),
      })),
    }
  }))
  if (!lots.length) return null
  // Contexte autour du DPGF (dossier) : surfaces, référence, observations
  let ctx = {}
  const findCtx = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 6) return
    if (o.surfaces && typeof o.surfaces === 'object' && !ctx.surfaces) ctx.surfaces = o.surfaces
    if (Array.isArray(o.observations) && !ctx.observations) ctx.observations = o.observations
    for (const v of Object.values(o)) if (v !== found.lots) findCtx(v, depth + 1)
  }
  findCtx(root, 0)
  const sf = ctx.surfaces || {}
  const shab = num(sf.shab_total_m2 ?? sf.shab_m2 ?? sf.shab ?? found.surface_m2)
  const annexes = num(sf.garage_m2 ?? sf.annexes_m2 ?? found.surface_annexes)
  const obs = found.observations || ctx.observations
  return {
    lots,
    ...(shab ? { surface_m2: shab } : {}),
    ...(annexes ? { surface_annexes: annexes } : {}),
    // « DPGF-2026-030 indice A » → référence + indice
    ...(found.reference ? splitReference(found.reference) : {}),
    ...(Array.isArray(obs) && obs.length ? { observations: obs.map(String).join('\n').slice(0, 4000) } : {}),
  }
}

/** Observations du DPGF (texte, une par ligne) à partir de la réponse de l'IA. */
export function observationsText({ hypotheses = [], non_compris = [] } = {}) {
  return [...hypotheses, ...(non_compris.length ? [`Non compris : ${non_compris.join(', ')}.`] : [])].join('\n')
}

/** Schéma JSON de la relecture des prix par l'IA. */
export const VERIF_AI_SCHEMA = {
  type: 'object',
  properties: {
    synthese: { type: 'string' },
    remarques: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['oubli', 'prix_bas', 'prix_haut', 'quantite', 'incoherence', 'info'] },
          poste: { type: 'string' },
          message: { type: 'string' },
          impact_ht: { type: 'number' },
        },
        required: ['type', 'poste', 'message', 'impact_ht'],
        additionalProperties: false,
      },
    },
  },
  required: ['synthese', 'remarques'],
  additionalProperties: false,
}

/** DPGF compact pour l'IA (numéros, verrous, honoraires). */
export function dpgfForAi(lots = []) {
  return lots.map((l, i) => ({
    n: lotNumero(i), lot: l.nom, ...(l.honoraires ? { honoraires: true } : {}),
    postes: l.postes.map((p, j) => ({ n: posteNumero(i, j), designation: p.designation, unite: p.unite, quantite: p.quantite, pu_ht: p.pu_ht, ...(p.verrou ? { verrou: true } : {}) })),
    total_ht: lotTotal(l),
  }))
}
