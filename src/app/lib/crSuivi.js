// Comptes rendus de chantier « intelligents » : logique pure (sans React ni
// Supabase), testée dans __tests__/crSuivi.test.js.
//
// - numérotation qui se suit par chantier ;
// - reprise des actions ouvertes du CR précédent, validation (fait),
//   relance d'une semaine sur l'autre avec montée de la priorité ;
// - photo des actions enregistrée avec le CR (taches_suivi, migration 033) ;
// - intervenants : présence à la réunion + convocation à la suivante ;
// - texte des mails (CR + convocation + actions de chaque entreprise).

import { addDaysISO } from './today'

const day = (v) => (v ? String(v).slice(0, 10) : '')
const chOf = (x) => x?.chantierId || x?.chantier_id || null
const norm = (s) => String(s || '').trim().toLowerCase()

// ─── Priorités ───────────────────────────────────────────────────────────
// Valeurs utilisées par l'écran Tâches (du moins au plus urgent). Chaque
// relance fait monter la priorité d'un cran.
export const PRIORITY_LADDER = ['En attente', 'En cours', 'Urgent']
export const PRIORITY_LABELS = ['Basse', 'Normale', 'Urgente']

export function priorityLevel(p) {
  const v = norm(p)
  if (['urgent', 'urgente', 'haute', 'élevée', 'elevee'].includes(v)) return 2
  if (['en attente', 'faible', 'basse'].includes(v)) return 0
  return 1
}
export const escalatePriority = (p) => PRIORITY_LADDER[Math.min(2, priorityLevel(p) + 1)]
export const priorityLabel = (p) => PRIORITY_LABELS[priorityLevel(p)]

// ─── États d'une action dans un CR ───────────────────────────────────────
export const SUIVI = {
  relance: 'À relancer',
  en_cours: 'En cours',
  fait: 'Fait',
  nouveau: 'Nouveau',
}
const SUIVI_ORDER = { relance: 0, en_cours: 1, nouveau: 2, fait: 3 }

// ─── Numérotation ────────────────────────────────────────────────────────
export function crsOfChantier(crs = [], chantierId) {
  return crs.filter(c => chOf(c) === chantierId)
    .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || day(a.date).localeCompare(day(b.date)))
}

/** Numéro du prochain CR du chantier (les numéros se suivent par chantier). */
export function nextCrNumero(crs, chantierId) {
  return crsOfChantier(crs, chantierId).reduce((max, c) => Math.max(max, Number(c.numero) || 0), 0) + 1
}

/** CR précédent du chantier (numéro inférieur), hors CR en cours d'édition. */
export function previousCr(crs, chantierId, { numero = null, excludeId = null } = {}) {
  const list = crsOfChantier(crs, chantierId).filter(c => c.id !== excludeId
    && (numero == null || (Number(c.numero) || 0) < Number(numero)))
  return list[list.length - 1] || null
}

/** Jours de retard à la date de référence (0 si dans les temps / sans échéance). */
export function daysLate(echeance, refDate) {
  const e = day(echeance), r = day(refDate)
  if (!e || !r || e >= r) return 0
  const [y1, m1, d1] = e.split('-').map(Number)
  const [y2, m2, d2] = r.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

// ─── Points (actions) du CR ──────────────────────────────────────────────
// Un point = une ligne de `taches`. Il garde son numéro (num_point) d'un CR
// à l'autre et appartient à un lot (« Généralités » si aucun).
export const GENERAL = 'Généralités'
export const lotOf = (x) => String(x?.lot || '').trim() || GENERAL
// Clé de lot : sans accents ni casse (« Électricité » = « electricite »,
// « Gros œuvre » = « gros oeuvre »), espaces réduits.
const fold = (s) => norm(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
export const lotKey = (lot) => fold(lot) || fold(GENERAL)

/** Photos enregistrables (déjà déposées) : { path, legende }. */
export const savedPhotos = (photos) => (Array.isArray(photos) ? photos : [])
  .filter(p => p && p.path).map(p => ({ path: p.path, legende: p.legende || '' }))

const rowFromTask = (t, suivi) => ({
  key: t.id, id: t.id, orig: t,
  titre: t.titre || '', entreprise: t.entreprise || '', lot: lotOf(t),
  echeance: day(t.echeance), priorite: t.priorite || 'En cours',
  rappels: Number(t.nb_rappels) || 0, origineNumero: t.cr_origine_numero ?? null,
  num: t.num_point ?? null, photos: Array.isArray(t.photos) ? t.photos : [],
  suivi, initialSuivi: suivi,
})

export const sortRows = (rows) => [...rows].sort((a, b) =>
  (SUIVI_ORDER[a.suivi] ?? 9) - (SUIVI_ORDER[b.suivi] ?? 9)
  || (b.rappels || 0) - (a.rappels || 0)
  || (Number(a.num) || 9999) - (Number(b.num) || 9999)
  || (day(a.echeance) || '9999').localeCompare(day(b.echeance) || '9999'))

/** Numéro du prochain point du chantier. */
export function nextPointNumber(tasks = [], chantierId) {
  return tasks.filter(t => chOf(t) === chantierId)
    .reduce((max, t) => Math.max(max, Number(t.num_point) || 0), 0) + 1
}

/**
 * Points affichés dans le CR.
 * - CR existant avec photo : les points de la photo (valeurs à jour de la
 *   tâche si elle existe encore, état de la photo).
 * - Nouveau CR : points ouverts du chantier (en retard → « À relancer »,
 *   sinon « En cours ») + points soldés depuis le CR précédent (« Fait »).
 */
export function initialRows({ tasks = [], chantierId, crDate, cr = null, previous = null }) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const snap = Array.isArray(cr?.taches_suivi) ? cr.taches_suivi : []
  if (cr?.id && snap.length) {
    return snap.map((s, i) => {
      const t = s.id && byId.get(s.id)
      if (t) return { ...rowFromTask(t, s.suivi || 'en_cours'), origineNumero: t.cr_origine_numero ?? s.origine ?? null, num: t.num_point ?? s.num ?? null }
      return {
        key: s.id || `snap-${i}`, id: s.id || null, orig: null, missing: true,
        titre: s.titre || '', entreprise: s.entreprise || '', lot: lotOf(s),
        echeance: day(s.echeance), priorite: s.priorite || 'En cours',
        rappels: Number(s.rappels) || 0, origineNumero: s.origine ?? null, num: s.num ?? null,
        photos: Array.isArray(s.photos) ? s.photos : [],
        suivi: s.suivi || 'en_cours', initialSuivi: s.suivi || 'en_cours',
      }
    })
  }
  if (cr?.id) return []
  const chTasks = tasks.filter(t => chOf(t) === chantierId)
  const open = chTasks.filter(t => t.statut !== 'Terminé')
    .map(t => rowFromTask(t, daysLate(t.echeance, crDate) > 0 ? 'relance' : 'en_cours'))
  const prevOpen = new Set((previous?.taches_suivi || []).filter(s => s.suivi !== 'fait' && s.id).map(s => s.id))
  const doneSince = chTasks.filter(t => t.statut === 'Terminé' && prevOpen.has(t.id)).map(t => rowFromTask(t, 'fait'))
  return sortRows([...open, ...doneSince])
}

let newSeq = 0
/** Point vierge (échéance : prochaine réunion ou J+7). */
export function newRow({ crDate, nextDate, entreprise = '', lot = GENERAL, titre = '', priorite = 'En cours', echeance = '' } = {}) {
  newSeq += 1
  const base = day(crDate) || null
  return {
    key: `new-${newSeq}`, id: null, orig: null, isNew: true,
    titre, entreprise, lot: String(lot || '').trim() || GENERAL,
    echeance: day(echeance) || day(nextDate) || (base ? addDaysISO(base, 7) : ''),
    priorite, rappels: 0, origineNumero: null, num: null, photos: [], suivi: 'nouveau',
  }
}

/** Priorité après enregistrement (relance → un cran au-dessus, une seule fois par CR). */
export function effectivePriority(row, crId) {
  if (row.suivi !== 'relance' || row.isNew || !row.orig) return row.priorite
  if (crId && row.orig.dernier_rappel_cr_id === crId) return row.priorite
  return escalatePriority(row.priorite)
}

const lotForDb = (lot) => (lotOf({ lot }) === GENERAL ? null : String(lot).trim())

/**
 * Modifications à écrire pour enregistrer le CR. Les points sans numéro en
 * reçoivent un à partir de `nextNum`. Les photos doivent être déposées
 * (path) : celles encore locales sont ignorées.
 * @returns {{ updates: {id, patch}[], inserts: object[], snapshot: object[] }}
 */
export function planCrTasks({ rows = [], crId, crNumero, chantierId, newId, nextNum = 1 }) {
  const updates = [], inserts = [], snapshot = []
  const numero = Number(crNumero) || null
  let num = Number(nextNum) || 1
  for (const row of rows) {
    const titre = String(row.titre || '').trim()
    const photos = savedPhotos(row.photos)
    if (row.isNew) {
      if (!titre) continue
      const id = newId()
      const task = {
        id, chantier_id: chantierId, titre, entreprise: row.entreprise?.trim() || null,
        lot: lotForDb(row.lot), echeance: day(row.echeance) || null,
        priorite: row.priorite || 'En cours', statut: 'Planifié', num_point: num++, photos,
        cr_origine_id: crId, cr_origine_numero: numero, nb_rappels: 0,
      }
      inserts.push(task)
      snapshot.push({
        id, num: task.num_point, titre, entreprise: task.entreprise || '', lot: lotOf(task), echeance: task.echeance,
        priorite: task.priorite, statut: task.statut, suivi: 'nouveau', rappels: 0, origine: numero, photos,
      })
      continue
    }
    const t = row.orig
    if (!t) {
      snapshot.push({
        id: row.id || null, num: row.num ?? null, titre, entreprise: row.entreprise || '', lot: lotOf(row),
        echeance: day(row.echeance) || null, priorite: row.priorite, statut: null,
        suivi: row.suivi, rappels: row.rappels || 0, origine: row.origineNumero ?? null, photos,
      })
      continue
    }
    const patch = {}
    if (titre && titre !== t.titre) patch.titre = titre
    if (norm(row.entreprise) !== norm(t.entreprise)) patch.entreprise = row.entreprise?.trim() || null
    if (lotKey(lotOf(row)) !== lotKey(lotOf(t))) patch.lot = lotForDb(row.lot)
    if (day(row.echeance) !== day(t.echeance)) patch.echeance = day(row.echeance) || null
    if (JSON.stringify(photos) !== JSON.stringify(savedPhotos(t.photos))) patch.photos = photos
    const pointNum = t.num_point ?? num++
    if (t.num_point == null) patch.num_point = pointNum
    let priorite = row.priorite || t.priorite
    if (priorite !== t.priorite) patch.priorite = priorite
    let statut = t.statut
    let rappels = Number(t.nb_rappels) || 0
    // « Fait » solde la tâche ; elle n'est rouverte que si l'on retire
    // explicitement « Fait » (une tâche soldée après le CR reste soldée
    // quand on retouche ce CR).
    if (row.suivi === 'fait') statut = 'Terminé'
    else if (statut === 'Terminé' && row.initialSuivi === 'fait') statut = 'En cours'
    if (row.suivi === 'relance' && t.dernier_rappel_cr_id !== crId) {
      rappels += 1
      priorite = escalatePriority(priorite)
      Object.assign(patch, { nb_rappels: rappels, dernier_rappel_cr_id: crId, priorite })
    }
    if (statut !== t.statut) patch.statut = statut
    if (Object.keys(patch).length) updates.push({ id: t.id, patch })
    snapshot.push({
      id: t.id, num: pointNum, titre: titre || t.titre,
      entreprise: (patch.entreprise !== undefined ? patch.entreprise : t.entreprise) || '',
      lot: lotOf(patch.lot !== undefined ? { lot: patch.lot } : t),
      echeance: (patch.echeance !== undefined ? patch.echeance : day(t.echeance)) || null,
      priorite, statut, suivi: row.suivi, rappels, origine: t.cr_origine_numero ?? row.origineNumero ?? null, photos,
    })
  }
  return { updates, inserts, snapshot: sortRows(snapshot) }
}

/** Compteurs d'une photo de points (page de garde, cartes CR). */
export function crTaskStats(snapshot = []) {
  const s = { total: 0, nouveau: 0, fait: 0, relance: 0, en_cours: 0, urgent: 0 }
  for (const r of snapshot || []) {
    s.total += 1
    if (s[r.suivi] !== undefined) s[r.suivi] += 1
    if (r.suivi !== 'fait' && priorityLevel(r.priorite) === 2) s.urgent += 1
  }
  return s
}

// ─── Sections par lot ────────────────────────────────────────────────────
const toISODate = (iso) => {
  const [y, m, d] = day(iso).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * Avancement prévu (%) d'un lot à une date, d'après le planning du chantier
 * (moyenne des phases du lot pondérée par leur durée). null sans planning.
 */
export function plannedProgress(planning = [], chantierId, lot, date) {
  const rows = planning.filter(p => chOf(p) === chantierId && p.debut && p.fin && lotKey(p.lot) === lotKey(lot))
  if (!rows.length || !day(date)) return null
  const at = toISODate(date)
  let total = 0, done = 0
  for (const p of rows) {
    const a = toISODate(p.debut), b = toISODate(p.fin)
    const len = Math.max(1, b - a)
    total += len
    done += len * Math.min(1, Math.max(0, (at - a) / len))
  }
  return Math.round((done / total) * 100)
}

/**
 * Entreprise d'un lot devinée d'après les OS du chantier (spécialité ≈ lot) :
 * société du contact si on la connaît, sinon nom de l'artisan.
 */
export function guessEntreprise(ordresService = [], chantierId, lot, contacts = []) {
  const k = lotKey(lot)
  const os = ordresService.find(o => o.chantier_id === chantierId && o.artisan_nom && o.artisan_specialite
    && (lotKey(o.artisan_specialite).includes(k) || k.includes(lotKey(o.artisan_specialite))))
  if (!os) return ''
  return contacts.find(c => c.nom === os.artisan_nom)?.societe || os.artisan_nom
}

const chantierLots = (ch) => (Array.isArray(ch?.lots) ? ch.lots : String(ch?.lots || '').split(','))
  .map(l => String(l || '').trim()).filter(Boolean)

const emptySection = (lot, extra = {}) => ({
  key: lotKey(lot), lot, entreprise: '', avancement: null, avancement_prec: null, prevu: null,
  observations: '', photos: [], ...extra,
})

/**
 * Sections du CR : « Généralités » puis un lot par entrée (lots du chantier,
 * lots du CR précédent, lots des points). Avancement précédent et entreprise
 * repris du CR précédent ; avancement prévu calculé depuis le planning.
 */
export function buildSections({ chantier, previous = null, cr = null, rows = [], planning = [], ordresService = [], contacts = [], crDate }) {
  const chId = chantier?.id
  const out = []
  const seen = new Map()
  const add = (s) => { if (!seen.has(s.key)) { seen.set(s.key, s); out.push(s) } }
  const prevByKey = new Map((previous?.sections || []).map(s => [lotKey(s.lot), s]))
  const make = (lot) => {
    const isGeneral = lotKey(lot) === lotKey(GENERAL)
    const prev = prevByKey.get(lotKey(lot))
    return emptySection(isGeneral ? GENERAL : lot, isGeneral ? {} : {
      entreprise: prev?.entreprise || guessEntreprise(ordresService, chId, lot, contacts),
      avancement: prev?.avancement ?? null,
      avancement_prec: prev?.avancement ?? null,
      prevu: plannedProgress(planning, chId, lot, crDate),
    })
  }
  if (cr?.id && Array.isArray(cr.sections) && cr.sections.length) {
    for (const s of cr.sections) add({ ...emptySection(s.lot), ...s, key: lotKey(s.lot), photos: Array.isArray(s.photos) ? s.photos : [] })
  } else {
    add(make(GENERAL))
    for (const l of chantierLots(chantier)) add(make(l))
    for (const s of previous?.sections || []) add(make(s.lot))
  }
  if (!seen.has(lotKey(GENERAL))) { const g = emptySection(GENERAL); out.unshift(g); seen.set(g.key, g) }
  for (const r of rows) add(make(lotOf(r)))
  return out
}

/** Avancement global : moyenne des lots renseignés (null si aucun). */
export function globalProgress(sections = []) {
  const vals = sections.filter(s => s.key !== lotKey(GENERAL) && s.avancement != null && s.avancement !== '')
    .map(s => Number(s.avancement)).filter(n => Number.isFinite(n))
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

/** Sections enregistrées (photos déposées uniquement, sans clés internes). */
export const sectionsForDb = (sections = []) => sections.map(s => ({
  lot: s.lot, entreprise: s.entreprise || '',
  avancement: s.avancement === '' || s.avancement == null ? null : Math.max(0, Math.min(100, Number(s.avancement) || 0)),
  avancement_prec: s.avancement_prec ?? null, prevu: s.prevu ?? null,
  observations: s.observations || '', photos: savedPhotos(s.photos),
}))

// ─── Dictée + IA ─────────────────────────────────────────────────────────
/** Contexte compact envoyé à l'IA : lots (entreprise) et points ouverts. */
export function aiContext({ sections = [], rows = [] }) {
  return {
    lots: sections.map(s => ({ lot: s.lot, entreprise: s.entreprise || '' })),
    points: rows.filter(r => !r.isNew && r.id).map(r => ({
      id: r.id, num: r.num ?? null, lot: lotOf(r), titre: r.titre, entreprise: r.entreprise || '', echeance: r.echeance || null, etat: r.suivi,
    })),
  }
}

const SUIVI_KEYS = ['fait', 'en_cours', 'relance']
const appendText = (a, b) => [String(a || '').trim(), String(b || '').trim()].filter(Boolean).join('\n')

/**
 * Applique la proposition de l'IA (déjà validée par l'utilisateur) :
 * états des points existants, nouveaux points, observations / avancement
 * par lot, résumé et décisions (ajoutés au texte existant).
 */
export function applyAiResult({ sections = [], rows = [], resume = '', decisions = '' }, result = {}, { crDate, nextDate } = {}) {
  let outSections = sections.map(s => ({ ...s }))
  const sectionFor = (lot) => {
    const k = lotKey(lot)
    let s = outSections.find(x => x.key === k)
      || outSections.find(x => x.key !== lotKey(GENERAL) && (x.key.includes(k) || k.includes(x.key)))
    if (!s) { s = emptySection(String(lot || '').trim() || GENERAL); outSections = [...outSections, s] }
    return s
  }
  for (const l of result.lots || []) {
    if (!l || !l.lot) continue
    const s = sectionFor(l.lot)
    if (l.observations) s.observations = appendText(s.observations, l.observations)
    const av = Number(l.avancement)
    if (l.avancement != null && Number.isFinite(av) && s.key !== lotKey(GENERAL)) s.avancement = Math.max(0, Math.min(100, Math.round(av)))
  }
  let outRows = rows.map(r => {
    const u = (result.points_existants || []).find(p => p && p.id === r.id)
    if (!u || r.missing) return r
    return {
      ...r,
      suivi: SUIVI_KEYS.includes(u.etat) ? u.etat : r.suivi,
      echeance: day(u.echeance) || r.echeance,
    }
  })
  for (const p of result.nouveaux_points || []) {
    if (!p || !String(p.titre || '').trim()) continue
    const s = sectionFor(p.lot || GENERAL)
    outRows = [...outRows, newRow({
      crDate, nextDate, lot: s.lot, titre: String(p.titre).trim(),
      entreprise: p.entreprise || s.entreprise || '', echeance: p.echeance,
      priorite: PRIORITY_LADDER.includes(p.priorite) ? p.priorite : 'En cours',
    })]
  }
  return {
    sections: outSections, rows: outRows,
    resume: appendText(resume, result.resume),
    decisions: appendText(decisions, result.decisions),
  }
}

// ─── Intervenants ────────────────────────────────────────────────────────
/**
 * Intervenants possibles d'un chantier : maître d'ouvrage (contact au nom du
 * client), entreprises des OS, contacts rattachés au chantier.
 */
export function chantierIntervenants(data = {}, chantierId) {
  if (!chantierId) return []
  const ch = (data.chantiers || []).find(c => c.id === chantierId)
  const contacts = data.contacts || []
  const byName = new Map(contacts.map(c => [c.nom, c]))
  const byId = new Map(contacts.map(c => [c.id, c]))
  const seen = new Set()
  const out = []
  const push = (c, role) => {
    if (!c || seen.has(c.id)) return
    seen.add(c.id)
    out.push({
      id: c.id, nom: c.nom || '', societe: c.societe || '', email: c.email || '',
      tel: c.tel || c.tel_fixe || '', siret: c.siret || '', role: role || c.specialite || c.type || '',
    })
  }
  if (ch?.client) push(byName.get(ch.client), 'Maître d\'ouvrage')
  for (const o of data.ordresService || []) {
    if (o.chantier_id === chantierId && o.artisan_nom) push(byName.get(o.artisan_nom), o.artisan_specialite)
  }
  for (const l of data.contactChantiers || []) {
    if (l.chantier_id === chantierId) push(byId.get(l.contact_id))
  }
  return out
}

export const entrepriseOf = (it) => String(it?.societe || it?.nom || '').trim()

/** Entrée « intervenant » enregistrée dans le CR (présence + convocation). */
export const toCrIntervenant = (c, prev = {}) => ({
  nom: c.nom || '', email: c.email || '', societe: c.societe || c.nom || '',
  tel: c.tel || '', siret: c.siret || '', role: c.role || prev.role || '',
  presence: prev.presence || 'Présent', convoque: prev.convoque !== false,
})

/** Intervenants pré-cochés d'un nouveau CR : les convoqués du CR précédent. */
export function carryIntervenants(previous) {
  return (previous?.intervenants || [])
    .filter(it => it && it.convoque !== false)
    .map(it => ({ ...toCrIntervenant(it, it), presence: 'Présent', convoque: true }))
}

/** Actions encore ouvertes d'un intervenant (rapprochement par entreprise / nom). */
export function actionsFor(snapshot = [], it) {
  const keys = new Set([norm(it?.societe), norm(it?.nom)].filter(Boolean))
  return (snapshot || []).filter(r => r.suivi !== 'fait' && keys.has(norm(r.entreprise)))
}

// ─── Prochaine réunion ───────────────────────────────────────────────────
/** Réunion suivante par défaut : +7 jours, même heure et même lieu. */
export function defaultNextMeeting({ crDate, previous, chantier }) {
  const prev = previous?.prochaine_reunion || {}
  return {
    date: day(crDate) ? addDaysISO(day(crDate), 7) : '',
    heure: prev.heure || '09:00',
    lieu: prev.lieu || chantier?.adresse || 'Sur le chantier',
  }
}

/** Date du CR proposée : date de réunion annoncée au CR précédent si elle n'est pas passée. */
export function defaultCrDate(previous, today) {
  const planned = day(previous?.prochaine_reunion?.date)
  return planned && planned >= today ? planned : today
}

// ─── Mails ───────────────────────────────────────────────────────────────
export function fmtLongDate(iso) {
  const d = day(iso)
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(y, m - 1, dd).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const fmtShort = (iso) => {
  const d = day(iso)
  if (!d) return ''
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
const fmtHeure = (h) => (h ? String(h).slice(0, 5).replace(':', 'h') : '')

/** Semaine ISO (numéro) d'une date AAAA-MM-JJ. */
export function isoWeek(iso) {
  const d = day(iso)
  if (!d) return null
  const [y, m, dd] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, dd))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7)
}

export function crMailSubject(cr, chantier) {
  const next = cr?.prochaine_reunion?.date
  return `Compte rendu de chantier n°${cr?.numero || ''} — ${chantier?.nom || 'chantier'}`
    + (next ? ` — convocation le ${fmtShort(next)}` : '')
}

export function crMailIntro(cr, chantier) {
  return `Veuillez trouver ci-joint le compte rendu n°${cr?.numero || ''} de la réunion de chantier du ${fmtShort(cr?.date)} (${chantier?.nom || 'chantier'}).`
}

/** Corps complet du mail d'un destinataire : message + convocation + ses actions. */
export function crMailText({ intro, cr, it, company = {} }) {
  const parts = [`Bonjour${it?.nom ? ` ${it.nom}` : ''},`, String(intro || '').trim()]
  const next = cr?.prochaine_reunion
  if (next?.date && it?.convoque !== false) {
    parts.push([
      'Vous êtes convoqué(e) à la prochaine réunion de chantier :',
      `  • le ${fmtLongDate(next.date)}${next.heure ? ` à ${fmtHeure(next.heure)}` : ''}`,
      next.lieu ? `  • lieu : ${next.lieu}` : null,
      'Votre présence est indispensable.',
    ].filter(Boolean).join('\n'))
  }
  const actions = actionsFor(cr?.taches_suivi, it)
  if (actions.length) {
    const lines = actions.map(a => {
      const late = a.suivi === 'relance'
      return `  • ${a.titre}${a.echeance ? ` — échéance ${fmtShort(a.echeance)}` : ''}`
        + (late ? ` — RELANCE${a.rappels > 1 ? ` n°${a.rappels}` : ''}` : '')
        + (priorityLevel(a.priorite) === 2 ? ' — URGENT' : '')
    })
    parts.push(['Actions à votre charge :', ...lines].join('\n'))
    if (actions.some(a => a.suivi === 'relance')) {
      parts.push('Les points relancés étaient attendus : merci de les traiter avant la prochaine réunion.')
    }
  }
  parts.push('Sans remarque de votre part sous 8 jours, ce compte rendu est réputé approuvé.')
  parts.push(`Cordialement,\n${company.nom || ''}`.trim())
  return parts.filter(Boolean).join('\n\n')
}
