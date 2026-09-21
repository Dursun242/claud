/**
 * Logique métier pure du CRM (aucune dépendance React / Supabase).
 *
 * - Étapes du pipeline + couleurs + probabilité par défaut
 * - Types d'interactions
 * - KPI du pipeline (montant total, pondéré, gagné sur la période…)
 * - Relances en retard / à venir
 *
 * Testé dans __tests__/crm.test.js.
 */

// Étapes du pipeline dans l'ordre de progression. Les deux dernières
// sont des étapes de clôture (l'opportunité sort du pipeline actif).
export const ETAPES = ['Prospect', 'Qualifié', 'Devis envoyé', 'Négociation', 'Gagné', 'Perdu']
export const ETAPES_ACTIVES = ETAPES.filter(e => e !== 'Gagné' && e !== 'Perdu')

export const ETAPE_COLORS = {
  'Prospect':     '#64748B',
  'Qualifié':     '#3B82F6',
  'Devis envoyé': '#8B5CF6',
  'Négociation':  '#F59E0B',
  'Gagné':        '#10B981',
  'Perdu':        '#EF4444',
}

// Probabilité proposée par défaut quand on change d'étape (l'utilisateur
// peut la surcharger). Gagné = 100, Perdu = 0 : non modifiable.
export const ETAPE_PROBA = {
  'Prospect': 10, 'Qualifié': 30, 'Devis envoyé': 50,
  'Négociation': 70, 'Gagné': 100, 'Perdu': 0,
}

export const INTERACTION_TYPES = ['Appel', 'Email', 'Réunion', 'Visite', 'Note']
export const INTERACTION_ICONS = {
  'Appel': '📞', 'Email': '✉️', 'Réunion': '🤝', 'Visite': '🏠', 'Note': '📝',
}

export const SOURCES = [
  'Bouche à oreille', 'Site web', 'Architecte', 'Ancien client',
  'Appel entrant', 'Réseau', 'Autre',
]

export const isClosed = (etape) => etape === 'Gagné' || etape === 'Perdu'

/** Probabilité à appliquer quand on passe à `etape`. */
export function probaForEtape(etape, current) {
  if (isClosed(etape)) return ETAPE_PROBA[etape]
  const c = Number(current)
  // On garde la valeur saisie si elle est cohérente, sinon défaut d'étape
  if (Number.isFinite(c) && c > 0 && c < 100) return c
  return ETAPE_PROBA[etape] ?? 20
}

/** Étape suivante dans le flux (null si clôturée ou en Négociation). */
export function nextEtape(etape) {
  const i = ETAPES_ACTIVES.indexOf(etape)
  if (i < 0 || i >= ETAPES_ACTIVES.length - 1) return null
  return ETAPES_ACTIVES[i + 1]
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const isoDay = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

/**
 * Regroupe les opportunités par étape (objet { etape: [opps…] }) en
 * respectant l'ordre canonique. Tri interne : montant décroissant.
 */
export function groupByEtape(opps = []) {
  const acc = Object.fromEntries(ETAPES.map(e => [e, []]))
  for (const o of opps) {
    const key = ETAPES.includes(o.etape) ? o.etape : 'Prospect'
    acc[key].push(o)
  }
  for (const e of ETAPES) acc[e].sort((a, b) => num(b.montant_estime) - num(a.montant_estime))
  return acc
}

/**
 * KPI du pipeline.
 * @param {Array} opps
 * @param {Date|string} [today]
 * @returns {{
 *   actives: number, montantPipeline: number, montantPondere: number,
 *   gagneesMois: number, montantGagneMois: number,
 *   tauxConversion: number|null
 * }}
 */
export function pipelineStats(opps = [], today = new Date()) {
  const t = today instanceof Date ? today : new Date(today)
  const ym = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  let actives = 0, montantPipeline = 0, montantPondere = 0
  let gagneesMois = 0, montantGagneMois = 0, gagnees = 0, perdues = 0
  for (const o of opps) {
    const m = num(o.montant_estime)
    if (!isClosed(o.etape)) {
      actives++
      montantPipeline += m
      montantPondere += m * (num(o.probabilite) / 100)
    } else if (o.etape === 'Gagné') {
      gagnees++
      const d = o.date_cloture || (o.updated_at ? isoDay(o.updated_at) : null)
      if (d && String(d).startsWith(ym)) { gagneesMois++; montantGagneMois += m }
    } else {
      perdues++
    }
  }
  const closed = gagnees + perdues
  return {
    actives, montantPipeline,
    montantPondere: Math.round(montantPondere),
    gagneesMois, montantGagneMois,
    tauxConversion: closed ? Math.round((gagnees / closed) * 100) : null,
  }
}

/**
 * Relances : interactions non faites avec une prochaine_action_date.
 * Retourne { overdue: [...], today: [...], upcoming: [...] } triées par date.
 */
export function classifyFollowUps(interactions = [], today = new Date()) {
  const td = isoDay(today)
  const overdue = [], todayList = [], upcoming = []
  for (const it of interactions) {
    if (it.action_faite || !it.prochaine_action_date) continue
    const d = String(it.prochaine_action_date).slice(0, 10)
    if (d < td) overdue.push(it)
    else if (d === td) todayList.push(it)
    else upcoming.push(it)
  }
  const byDate = (a, b) => String(a.prochaine_action_date).localeCompare(String(b.prochaine_action_date))
  overdue.sort(byDate); todayList.sort(byDate); upcoming.sort(byDate)
  return { overdue, today: todayList, upcoming }
}

/**
 * Nombre de jours depuis la dernière interaction d'une opportunité
 * (null si aucune). Sert à repérer les affaires « dormantes ».
 */
export function daysSinceLastInteraction(opp, interactions = [], today = new Date()) {
  const mine = interactions.filter(i => i.opportunite_id === opp.id)
  if (!mine.length) return null
  const last = mine.reduce((acc, i) => (new Date(i.date) > acc ? new Date(i.date) : acc), new Date(0))
  const t = today instanceof Date ? today : new Date(today)
  return Math.max(0, Math.floor((t - last) / 86400000))
}

/** Valide le formulaire opportunité. Retourne un message d'erreur ou "". */
export function validateOpportunite(form = {}) {
  if (!form.titre || !String(form.titre).trim()) return 'Le titre est requis.'
  if (!ETAPES.includes(form.etape)) return 'Étape invalide.'
  const m = Number(form.montant_estime)
  if (form.montant_estime !== '' && form.montant_estime != null && (!Number.isFinite(m) || m < 0))
    return 'Le montant doit être un nombre positif.'
  const p = Number(form.probabilite)
  if (form.probabilite !== '' && form.probabilite != null && (!Number.isFinite(p) || p < 0 || p > 100))
    return 'La probabilité doit être comprise entre 0 et 100.'
  if (form.etape === 'Perdu' && !(form.motif_perte || '').trim())
    return 'Indique le motif de la perte.'
  return ''
}

/** Valide le formulaire interaction. */
export function validateInteraction(form = {}) {
  if (!INTERACTION_TYPES.includes(form.type)) return 'Type invalide.'
  if (!form.sujet || !String(form.sujet).trim()) return 'Le sujet est requis.'
  if (form.prochaine_action_date && !(form.prochaine_action || '').trim())
    return 'Décris la prochaine action à mener.'
  return ''
}

/**
 * Construit le chantier à créer à partir d'une opportunité gagnée
 * (shape attendue par SB.upsertChantier).
 */
export function opportuniteToChantier(opp, contact = null) {
  return {
    nom: opp.titre,
    client: contact?.societe || contact?.nom || '',
    adresse: opp.adresse || contact?.adresse || '',
    phase: "Hors d'air",
    statut: 'Planifié',
    budget: num(opp.montant_estime),
    depenses: 0,
    lots: [],
    notes_internes: opp.notes
      ? `Issu de l'opportunité CRM « ${opp.titre} ».\n\n${opp.notes}`
      : `Issu de l'opportunité CRM « ${opp.titre} ».`,
  }
}

/** Nombre d'affaires actives + montant par contact (Map contact_id → {n, montant, gagnees}). */
export function oppsByContact(opps = []) {
  const map = new Map()
  for (const o of opps) {
    if (!o.contact_id) continue
    const acc = map.get(o.contact_id) || { n: 0, actives: 0, gagnees: 0, montant: 0 }
    acc.n++
    if (!isClosed(o.etape)) { acc.actives++; acc.montant += num(o.montant_estime) }
    if (o.etape === 'Gagné') acc.gagnees++
    map.set(o.contact_id, acc)
  }
  return map
}

/** Montant HT d'un devis Qonto (API v2 : amount.value ou *_cents). */
export function qontoQuoteAmount(q = {}) {
  const v = q.amount?.value ?? q.total_amount?.value
  if (v != null) return num(v)
  if (q.amount_cents != null) return num(q.amount_cents) / 100
  if (q.total_amount_cents != null) return num(q.total_amount_cents) / 100
  return 0
}

/**
 * Construit une opportunité à partir d'un devis Qonto.
 * - contact retrouvé par email (insensible à la casse) dans l'annuaire ;
 * - étape « Gagné » si le devis est approuvé, « Perdu » s'il est annulé,
 *   sinon « Devis envoyé » ;
 * - qonto_quote_id sert de clé anti-doublon (migration 026).
 */
export function quoteToOpportunite(q, contacts = []) {
  const email = (q.contact_email || '').toLowerCase().trim()
  const contact = email ? contacts.find(c => (c.email || '').toLowerCase().trim() === email) : null
  const etape = q.status === 'approved' ? 'Gagné' : q.status === 'canceled' ? 'Perdu' : 'Devis envoyé'
  const who = contact ? (contact.societe || contact.nom) : (q.contact_email || 'Client Qonto')
  return {
    titre: `Devis ${q.number || ''} — ${who}`.replace(/\s+—\s*$/, '').trim(),
    etape,
    probabilite: ETAPE_PROBA[etape],
    montant_estime: qontoQuoteAmount(q),
    contact_id: contact?.id || null,
    source: 'Devis Qonto',
    date_cloture_prevue: q.expiry_date || null,
    motif_perte: etape === 'Perdu' ? 'Devis annulé dans Qonto' : null,
    notes: `Devis Qonto ${q.number || ''}${q.issue_date ? ` émis le ${q.issue_date}` : ''}${q.contact_email ? ` — ${q.contact_email}` : ''}`,
    qonto_quote_id: q.id ? String(q.id) : null,
    qonto_quote_number: q.number || null,
  }
}

/**
 * Résumé compact du CRM pour le prompt de l'assistant IA (on évite les
 * champs lourds, on garde les UUID pour que l'IA puisse cibler ses actions).
 */
export function prepareCrmForAI(crm = {}, today = new Date()) {
  const opps = crm.opportunites || []
  const inters = crm.interactions || []
  const f = classifyFollowUps(inters, today)
  return {
    opportunites: opps.slice(0, 60).map(o => ({
      id: o.id, titre: o.titre, etape: o.etape, montant_estime: num(o.montant_estime),
      probabilite: num(o.probabilite), contact_id: o.contact_id, chantier_id: o.chantier_id,
      type_projet: o.type_projet, source: o.source, date_cloture_prevue: o.date_cloture_prevue,
      derniere_interaction_jours: daysSinceLastInteraction(o, inters, today),
    })),
    interactions_recentes: inters.slice(0, 30).map(i => ({
      id: i.id, opportunite_id: i.opportunite_id, type: i.type, sujet: i.sujet,
      date: String(i.date || '').slice(0, 10), prochaine_action: i.prochaine_action,
      prochaine_action_date: i.prochaine_action_date, action_faite: !!i.action_faite,
    })),
    relances: {
      en_retard: f.overdue.map(i => i.id),
      aujourdhui: f.today.map(i => i.id),
    },
  }
}
