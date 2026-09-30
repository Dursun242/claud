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

// ─── Actions du CR ───────────────────────────────────────────────────────
const rowFromTask = (t, suivi) => ({
  key: t.id, id: t.id, orig: t,
  titre: t.titre || '', entreprise: t.entreprise || '', lot: t.lot || '',
  echeance: day(t.echeance), priorite: t.priorite || 'En cours',
  rappels: Number(t.nb_rappels) || 0, origineNumero: t.cr_origine_numero ?? null,
  suivi, initialSuivi: suivi,
})

export const sortRows = (rows) => [...rows].sort((a, b) =>
  (SUIVI_ORDER[a.suivi] ?? 9) - (SUIVI_ORDER[b.suivi] ?? 9)
  || (b.rappels || 0) - (a.rappels || 0)
  || (day(a.echeance) || '9999').localeCompare(day(b.echeance) || '9999'))

/**
 * Actions affichées dans la fenêtre du CR.
 * - CR existant avec photo : les actions de la photo (valeurs à jour de la
 *   tâche si elle existe encore, état de la photo).
 * - Nouveau CR : actions ouvertes du chantier (en retard → « À relancer »,
 *   sinon « En cours ») + actions soldées depuis le CR précédent (« Fait »).
 */
export function initialRows({ tasks = [], chantierId, crDate, cr = null, previous = null }) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const snap = Array.isArray(cr?.taches_suivi) ? cr.taches_suivi : []
  if (cr?.id && snap.length) {
    return snap.map((s, i) => {
      const t = s.id && byId.get(s.id)
      if (t) return { ...rowFromTask(t, s.suivi || 'en_cours'), origineNumero: t.cr_origine_numero ?? s.origine ?? null }
      return {
        key: s.id || `snap-${i}`, id: s.id || null, orig: null, missing: true,
        titre: s.titre || '', entreprise: s.entreprise || '', lot: s.lot || '',
        echeance: day(s.echeance), priorite: s.priorite || 'En cours',
        rappels: Number(s.rappels) || 0, origineNumero: s.origine ?? null,
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
/** Ligne vierge « nouvelle action » (échéance : prochaine réunion ou J+7). */
export function newRow({ crDate, nextDate, entreprise = '' } = {}) {
  newSeq += 1
  const base = day(crDate) || null
  return {
    key: `new-${newSeq}`, id: null, orig: null, isNew: true,
    titre: '', entreprise, lot: '',
    echeance: day(nextDate) || (base ? addDaysISO(base, 7) : ''),
    priorite: 'En cours', rappels: 0, origineNumero: null, suivi: 'nouveau',
  }
}

/** Priorité après enregistrement (relance → un cran au-dessus, une seule fois par CR). */
export function effectivePriority(row, crId) {
  if (row.suivi !== 'relance' || row.isNew || !row.orig) return row.priorite
  if (crId && row.orig.dernier_rappel_cr_id === crId) return row.priorite
  return escalatePriority(row.priorite)
}

/**
 * Modifications à écrire pour enregistrer le CR.
 * @returns {{ updates: {id, patch}[], inserts: object[], snapshot: object[] }}
 */
export function planCrTasks({ rows = [], crId, crNumero, chantierId, newId }) {
  const updates = [], inserts = [], snapshot = []
  const numero = Number(crNumero) || null
  for (const row of rows) {
    const titre = String(row.titre || '').trim()
    if (row.isNew) {
      if (!titre) continue
      const id = newId()
      const task = {
        id, chantier_id: chantierId, titre, entreprise: row.entreprise?.trim() || null,
        lot: row.lot?.trim() || null, echeance: day(row.echeance) || null,
        priorite: row.priorite || 'En cours', statut: 'Planifié',
        cr_origine_id: crId, cr_origine_numero: numero, nb_rappels: 0,
      }
      inserts.push(task)
      snapshot.push({
        id, titre, entreprise: task.entreprise || '', lot: task.lot || '', echeance: task.echeance,
        priorite: task.priorite, statut: task.statut, suivi: 'nouveau', rappels: 0, origine: numero,
      })
      continue
    }
    const t = row.orig
    if (!t) {
      snapshot.push({
        id: row.id || null, titre, entreprise: row.entreprise || '', lot: row.lot || '',
        echeance: day(row.echeance) || null, priorite: row.priorite, statut: null,
        suivi: row.suivi, rappels: row.rappels || 0, origine: row.origineNumero ?? null,
      })
      continue
    }
    const patch = {}
    if (titre && titre !== t.titre) patch.titre = titre
    if (norm(row.entreprise) !== norm(t.entreprise)) patch.entreprise = row.entreprise?.trim() || null
    if (day(row.echeance) !== day(t.echeance)) patch.echeance = day(row.echeance) || null
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
      id: t.id, titre: titre || t.titre, entreprise: (patch.entreprise !== undefined ? patch.entreprise : t.entreprise) || '',
      lot: t.lot || '', echeance: (patch.echeance !== undefined ? patch.echeance : day(t.echeance)) || null,
      priorite, statut, suivi: row.suivi, rappels, origine: t.cr_origine_numero ?? row.origineNumero ?? null,
    })
  }
  return { updates, inserts, snapshot: sortRows(snapshot) }
}

/** Compteurs d'une photo d'actions (page de garde, cartes CR). */
export function crTaskStats(snapshot = []) {
  const s = { total: 0, nouveau: 0, fait: 0, relance: 0, en_cours: 0, urgent: 0 }
  for (const r of snapshot || []) {
    s.total += 1
    if (s[r.suivi] !== undefined) s[r.suivi] += 1
    if (r.suivi !== 'fait' && priorityLevel(r.priorite) === 2) s.urgent += 1
  }
  return s
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
