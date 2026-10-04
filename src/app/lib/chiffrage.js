// Chiffrage estimatif (DPGF) d'un chantier : lots → postes, totaux, aléas,
// comparaison avec la réalité (ordres de service rattachés à un lot),
// contrôles de bon sens et rattachement automatique d'un OS à un lot.
// Logique pure (ni React ni Supabase). Tests : __tests__/chiffrage.test.js.
//
// Montants HT. Postes : { id, designation, quantite, unite, pu_ht }.

export const UNITES = ['ens', 'u', 'm²', 'm³', 'ml', 'kg', 'h', 'j', 'forfait']

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
      postes: (Array.isArray(l?.postes) ? l.postes : []).map(p => ({
        id: p?.id || newId('p'),
        designation: String(p?.designation || '').trim().slice(0, 300),
        quantite: num(p?.quantite),
        unite: String(p?.unite || 'u').trim().slice(0, 12) || 'u',
        pu_ht: round2(num(p?.pu_ht)),
      })).filter(p => p.designation || p.pu_ht),
    }))
    .filter(l => l.nom || l.postes.length)
}

export const posteTotal = (p) => round2(num(p?.quantite) * num(p?.pu_ht))
export const lotTotal = (l) => round2((l?.postes || []).reduce((s, p) => s + posteTotal(p), 0))

/** Totaux du chiffrage : HT travaux, aléas, HT avec aléas, TVA, TTC, €/m². */
export function chiffrageTotals({ lots = [], aleas_pct = 0, tva_pct = 20, surface_m2 = null } = {}) {
  const ht = round2(lots.reduce((s, l) => s + lotTotal(l), 0))
  const aleas = round2(ht * num(aleas_pct) / 100)
  const htAleas = round2(ht + aleas)
  const tva = round2(htAleas * num(tva_pct) / 100)
  const surface = num(surface_m2)
  return { ht, aleas, htAleas, tva, ttc: round2(htAleas + tva), parM2: surface > 0 ? Math.round(htAleas / surface) : null }
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
  const lignes = lots.map(l => {
    const b = byLot.get(key(l.nom)) || { engage: 0, brouillon: 0, nbOs: 0 }
    byLot.delete(key(l.nom))
    const estime = lotTotal(l)
    return { nom: l.nom, estime, engage: round2(b.engage), brouillon: round2(b.brouillon), nbOs: b.nbOs, ecart: round2(b.engage - estime), pct: estime > 0 ? Math.round((b.engage / estime) * 100) : null }
  })
  // OS rattachés à un lot absent du chiffrage
  for (const b of byLot.values()) {
    lignes.push({ nom: b.nom, estime: 0, engage: round2(b.engage), brouillon: round2(b.brouillon), nbOs: b.nbOs, ecart: round2(b.engage), pct: null, horsChiffrage: true })
  }
  const estime = round2(lots.reduce((s, l) => s + lotTotal(l), 0))
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
 * prix ou sans quantité, doublons, poids d'un lot anormal, coût au m²
 * hors fourchette (maison individuelle : 900 à 3 500 € HT/m²).
 */
export function sanityChecks({ lots = [], surface_m2 = null, aleas_pct = 0 } = {}) {
  const out = []
  const total = lots.reduce((s, l) => s + lotTotal(l), 0)
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
    const part = total > 0 ? lotTotal(l) / total : 0
    if (lots.length >= 4 && part > 0.45) out.push(`Lot « ${l.nom} » : ${Math.round(part * 100)} % du total, poids inhabituel.`)
  }
  const surface = num(surface_m2)
  if (surface > 0 && total > 0) {
    const m2 = total * (1 + num(aleas_pct) / 100) / surface
    if (m2 < 900) out.push(`Coût de ${fmtE(m2)} HT/m² : bas pour une construction (souvent 1 400 à 2 500 € HT/m²). Un lot manque-t-il ?`)
    if (m2 > 3500) out.push(`Coût de ${fmtE(m2)} HT/m² : élevé pour une maison individuelle. Vérifier quantités et prix.`)
  }
  if (!num(aleas_pct) && total > 0) out.push('Aucune provision pour aléas : 5 à 10 % est d’usage.')
  return out
}

/**
 * Prix de référence de la société, tirés des OS passés (pour l'IA) :
 * [{ designation, unite, pu_ht, metier }], dédoublonnés, les plus récents d'abord.
 */
export function osPriceRefs(os = [], max = 80) {
  const seen = new Set()
  const out = []
  const sorted = [...os].sort((a, b) => String(b.date_emission || b.created_at || '').localeCompare(String(a.date_emission || a.created_at || '')))
  for (const o of sorted) {
    for (const p of o.prestations || []) {
      const designation = String(p.description || '').trim()
      const pu = num(p.prix_unitaire)
      if (!designation || !pu) continue
      const k = `${fold(designation)}|${fold(p.unite)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ designation: designation.slice(0, 140), unite: p.unite || 'u', pu_ht: round2(pu), metier: o.artisan_specialite || o.lot || '' })
      if (out.length >= max) return out
    }
  }
  return out
}

/** Export tableur (CSV « ; », virgule décimale) : une ligne par poste + sous-totaux. */
export function chiffrageCsvRows({ lots = [], aleas_pct = 0, tva_pct = 20, surface_m2 = null } = {}) {
  const f = (n) => String(round2(n)).replace('.', ',')
  const rows = [['Lot', 'Désignation', 'Quantité', 'Unité', 'PU HT', 'Total HT']]
  for (const l of lots) {
    for (const p of l.postes) rows.push([l.nom, p.designation, f(p.quantite), p.unite, f(p.pu_ht), f(posteTotal(p))])
    rows.push([`Sous-total ${l.nom}`, '', '', '', '', f(lotTotal(l))])
  }
  const t = chiffrageTotals({ lots, aleas_pct, tva_pct, surface_m2 })
  rows.push(['Total travaux HT', '', '', '', '', f(t.ht)])
  rows.push([`Aléas ${f(aleas_pct)} %`, '', '', '', '', f(t.aleas)])
  rows.push(['Total HT', '', '', '', '', f(t.htAleas)])
  rows.push([`TVA ${f(tva_pct)} %`, '', '', '', '', f(t.tva)])
  rows.push(['Total TTC', '', '', '', '', f(t.ttc)])
  return rows
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
    conseils: { type: 'array', items: { type: 'string' } },
  },
  required: ['lots', 'surface_m2', 'hypotheses', 'conseils'],
  additionalProperties: false,
}
