// Score des entreprises (artisans, sous-traitants, prestataires) : une note
// sur 100 calculée à partir de ce que l'application sait déjà de chacune.
// Logique pure (ni React ni Supabase), affichée dans Contacts (pastille sur
// la fiche, détail et classement). Tests : __tests__/entrepriseScore.test.js.
//
// Quatre critères, chacun sur un nombre de points :
//   Documents (25)  Kbis, décennale, URSSAF, fiscale, RIB : à jour = plein,
//                   à vérifier = moitié, manquant ou expiré = rien
//   Actions (35)    points des comptes rendus confiés à l'entreprise : fait
//                   sans relance = plein, chaque relance enlève un quart,
//                   en retard = moitié au mieux, mise en demeure = rien
//   Réunions (15)   présence aux réunions de chantier (CR diffusés) :
//                   présent = plein, excusé = moitié, absent = rien
//   Avis (25)       note de l'équipe (étoiles de la fiche)
// Un critère sans donnée n'est pas compté : la note est ramenée sur les
// critères connus (et signalée « peu de données » en dessous de la moitié
// des points). Une entreprise fermée, en liquidation ou en procédure
// collective (contrôle légal) voit sa note plafonnée.

import { SUBJECT_TYPES, DOC_KINDS } from './conformite'
import { findArtisanContact, normName } from './osArtisan'
import { sameEntreprise } from './crReponse'

export const CRITERIA = [
  { key: 'documents', label: 'Documents', max: 25, aide: 'Kbis, décennale, attestations URSSAF et fiscale, RIB' },
  { key: 'actions', label: 'Actions de chantier', max: 35, aide: 'Points des comptes rendus faits à temps, relances, mises en demeure' },
  { key: 'reunions', label: 'Réunions', max: 15, aide: 'Présence aux réunions de chantier' },
  { key: 'avis', label: 'Avis de l’équipe', max: 25, aide: 'Note en étoiles de la fiche contact' },
]

export const GRADES = [
  { grade: 'A', min: 85, label: 'Excellente', color: '#1E7B34', bg: '#EAF8EE', border: '#BFE9CA' },
  { grade: 'B', min: 70, label: 'Bonne', color: '#3A7A12', bg: '#F2F9EC', border: '#D3EBC4' },
  { grade: 'C', min: 55, label: 'Moyenne', color: '#A05A00', bg: '#FFF7E8', border: '#FFDDA6' },
  { grade: 'D', min: 40, label: 'Fragile', color: '#C93400', bg: '#FFF1E8', border: '#FFCFB0' },
  { grade: 'E', min: 0, label: 'À éviter', color: '#D70015', bg: '#FFF0EF', border: '#FFC9C6' },
]

/** Plafonds liés au contrôle légal. */
export const LEGAL_CAP = { critique: 15, alerte: 45 }

/** Moins de la moitié des points connus : note donnée à titre indicatif. */
export const PEU_DE_DONNEES = 50

export const gradeOf = (score) => (score == null ? null : GRADES.find(g => score >= g.min) || GRADES[GRADES.length - 1])

/** Entreprises notées : celles soumises à l'obligation de vigilance (actives). */
export const isScored = (c) => !!c && SUBJECT_TYPES.includes(c.type) && c.actif !== false

const DOC_VALUE = { ok: 1, bientot: 1, a_verifier: 0.5, manquant: 0, expire: 0 }
const day = (v) => (v ? String(v).slice(0, 10) : '')
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`

// ─── Rapprochement texte libre → contact ───────────────────────────────
/**
 * Contact désigné par un nom d'entreprise écrit à la main (tâche, CR) :
 * même nom ou raison sociale d'abord, sinon une ressemblance qui ne vise
 * qu'une seule entreprise (deux candidates → personne, pour ne pas noter
 * une entreprise sur le travail d'une autre).
 */
export function resolveEntreprise(text, contacts = [], { siret = '' } = {}) {
  const digits = String(siret || '').replace(/\D/g, '')
  if (digits.length >= 9) {
    const c = contacts.find(x => String(x.siret || '').replace(/\D/g, '').slice(0, 9) === digits.slice(0, 9))
    if (c) return c
  }
  const n = normName(text)
  if (!n) return null
  const exact = contacts.filter(x => normName(x.societe) === n || normName(x.nom) === n)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return exact.find(x => normName(x.societe) === n) || exact[0]
  const fuzzy = contacts.filter(x => sameEntreprise(x.societe, text) || sameEntreprise(x.nom, text))
  return fuzzy.length === 1 ? fuzzy[0] : null
}

/** Regroupe des éléments par contact (id → liste), via `resolve(item)`. */
function groupBy(items, resolve) {
  const out = new Map()
  for (const it of items) {
    const c = resolve(it)
    if (!c) continue
    if (!out.has(c.id)) out.set(c.id, [])
    out.get(c.id).push(it)
  }
  return out
}

// ─── Critères ──────────────────────────────────────────────────────────
/** Documents : moyenne des 5 documents. null si le suivi n'est pas disponible. */
export function documentsCriterion(compliance) {
  if (!compliance?.kinds) return null
  const vals = DOC_KINDS.map(k => DOC_VALUE[compliance.kinds[k]?.status] ?? 0)
  const ratio = vals.reduce((a, b) => a + b, 0) / DOC_KINDS.length
  const ok = DOC_KINDS.filter(k => DOC_VALUE[compliance.kinds[k]?.status] === 1).length
  return { ratio, detail: `${ok}/${DOC_KINDS.length} documents à jour` }
}

/**
 * Valeur d'une action (0 à 1), ou null si elle ne dit encore rien
 * (ouverte, ni en retard ni relancée).
 */
export function actionValue(t, today) {
  if (t.mise_en_demeure_le) return 0
  const r = Math.max(0, Number(t.nb_rappels) || 0)
  if (t.statut === 'Terminé') return Math.max(0.25, 1 - 0.25 * r)
  const late = !!day(t.echeance) && day(t.echeance) < today
  if (late) return Math.max(0, 0.5 - 0.2 * r)
  if (r > 0) return Math.max(0.25, 1 - 0.25 * r)
  return null
}

/** Actions de chantier confiées à l'entreprise. */
export function actionsCriterion(tasks = [], today) {
  const vals = []
  let faites = 0, retard = 0, relances = 0, med = 0
  for (const t of tasks) {
    const v = actionValue(t, today)
    relances += Math.max(0, Number(t.nb_rappels) || 0)
    if (t.mise_en_demeure_le) med++
    if (t.statut === 'Terminé') faites++
    else if (day(t.echeance) && day(t.echeance) < today) retard++
    if (v != null) vals.push(v)
  }
  if (!vals.length) return null
  const parts = [`${plural(faites, 'faite')} sur ${tasks.length}`]
  if (retard) parts.push(`${retard} en retard`)
  if (relances) parts.push(plural(relances, 'relance'))
  if (med) parts.push(plural(med, 'mise en demeure', 'mises en demeure'))
  return { ratio: vals.reduce((a, b) => a + b, 0) / vals.length, detail: parts.join(' · '), faites, retard, relances, med }
}

/**
 * Présence aux réunions : entrées des intervenants des CR diffusés. Une
 * absence d'une entreprise qui n'était pas convoquée ne compte pas.
 */
export function reunionsCriterion(entries = []) {
  let present = 0, excuse = 0, absent = 0
  for (const it of entries) {
    if (it.presence === 'Excusé') excuse++
    else if (it.presence === 'Absent') { if (it.convoque_prec !== false) absent++ }
    else present++
  }
  const n = present + excuse + absent
  if (!n) return null
  const parts = [`${present}/${n} présent${present > 1 ? 's' : ''}`]
  if (excuse) parts.push(plural(excuse, 'excusé'))
  if (absent) parts.push(plural(absent, 'absence'))
  return { ratio: (present + 0.5 * excuse) / n, detail: parts.join(' · ') }
}

export function avisCriterion(note) {
  const n = Math.round(Number(note) || 0)
  if (n < 1) return null
  return { ratio: Math.min(5, n) / 5, detail: `${Math.min(5, n)}/5 étoiles` }
}

// ─── Score ─────────────────────────────────────────────────────────────
/**
 * Score d'une entreprise.
 * @param {{ compliance?, legal?, tasks?, presences?, note?, os? }} p
 * @returns {{ score: number|null, grade, criteria: Array, known: number, peuDeDonnees: boolean, legal, cap, historique }}
 */
export function companyScore({ compliance = null, legal = null, tasks = [], presences = [], note = 0, os = [], today } = {}) {
  const raw = {
    documents: documentsCriterion(compliance),
    actions: actionsCriterion(tasks, today),
    reunions: reunionsCriterion(presences),
    avis: avisCriterion(note),
  }
  const criteria = CRITERIA.map(c => {
    const r = raw[c.key]
    return r
      ? { ...c, known: true, points: Math.round(r.ratio * c.max * 10) / 10, detail: r.detail }
      : { ...c, known: false, points: 0, detail: 'Pas encore de donnée' }
  })
  const known = criteria.filter(c => c.known).reduce((a, c) => a + c.max, 0)
  const got = criteria.filter(c => c.known).reduce((a, c) => a + c.points, 0)
  let score = known ? Math.round((got / known) * 100) : null
  const cap = LEGAL_CAP[legal?.statut] ?? null
  if (cap != null) score = Math.min(score ?? cap, cap)

  const actifs = (os || []).filter(o => o.statut !== 'Annulé')
  const historique = {
    chantiers: new Set(actifs.map(o => o.chantier_id).filter(Boolean)).size,
    os: actifs.length,
    montantHt: Math.round(actifs.reduce((a, o) => a + (Number(o.montant_ht) || 0), 0)),
    derniere: actifs.map(o => day(o.date_intervention || o.date_emission)).filter(Boolean).sort().pop() || null,
  }
  return {
    score, grade: gradeOf(score), criteria, known,
    peuDeDonnees: score != null && known < PEU_DE_DONNEES,
    legal: cap != null ? legal : null, cap, historique,
  }
}

/**
 * Score de chaque entreprise notée de l'annuaire.
 * @param {object} p
 * @param {Array} p.contacts
 * @param {Array} [p.tasks]          tâches (points des CR : entreprise, statut, echeance, nb_rappels…)
 * @param {Array} [p.compteRendus]   CR (intervenants avec presence, statut)
 * @param {Array} [p.ordresService]
 * @param {Map}   [p.byContact]      contact_id → situation des documents (null : suivi indisponible)
 * @param {Map}   [p.legalByContact] contact_id → contrôle légal
 * @returns {Map<string, ReturnType<typeof companyScore>>}
 */
export function scoreCompanies({ contacts = [], tasks = [], compteRendus = [], ordresService = [], byContact = null, legalByContact = null, today } = {}) {
  const scored = contacts.filter(isScored)
  const tasksBy = groupBy(tasks.filter(t => String(t.entreprise || '').trim()), t => resolveEntreprise(t.entreprise, scored))
  const entries = []
  for (const cr of compteRendus) {
    if (cr.statut === 'Brouillon') continue
    for (const it of Array.isArray(cr.intervenants) ? cr.intervenants : []) {
      if (it && typeof it === 'object') entries.push(it)
    }
  }
  const presBy = groupBy(entries, it => resolveEntreprise(it.societe || it.nom, scored, { siret: it.siret })
    || (it.nom && it.societe ? resolveEntreprise(it.nom, scored) : null))
  const osBy = groupBy(ordresService, o => {
    const c = findArtisanContact(o, contacts)
    return c && isScored(c) ? c : null
  })
  const out = new Map()
  for (const c of scored) {
    out.set(c.id, companyScore({
      compliance: byContact ? (byContact.get(c.id) || emptyCompliance()) : null,
      legal: legalByContact?.get(c.id) || null,
      tasks: tasksBy.get(c.id) || [],
      presences: presBy.get(c.id) || [],
      note: c.note,
      os: osBy.get(c.id) || [],
      today,
    }))
  }
  return out
}

const emptyCompliance = () => ({ kinds: Object.fromEntries(DOC_KINDS.map(k => [k, { status: 'manquant' }])) })

/**
 * Classement : entreprises notées, de la meilleure à la moins bonne (les
 * entreprises sans note à la fin), filtrées par spécialité et recherche.
 */
export function ranking(contacts = [], scores = new Map(), { specialite = '', q = '' } = {}) {
  const fq = normName(q)
  const fs = normName(specialite)
  return contacts.filter(isScored)
    .filter(c => !fs || normName(c.specialite).includes(fs))
    .filter(c => !fq || [c.nom, c.societe, c.specialite, c.ville].some(v => normName(v).includes(fq)))
    .map(c => ({ contact: c, ...(scores.get(c.id) || { score: null }) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)
      || (b.known || 0) - (a.known || 0)
      || String(a.contact.nom || '').localeCompare(String(b.contact.nom || ''), 'fr'))
}

/** Spécialités présentes parmi les entreprises notées (liste du filtre). */
export function specialites(contacts = []) {
  const seen = new Map()
  for (const c of contacts.filter(isScored)) {
    const s = String(c.specialite || '').trim()
    if (s && !seen.has(normName(s))) seen.set(normName(s), s)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}
