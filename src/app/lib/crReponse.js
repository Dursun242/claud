// Réponses des entreprises à leurs actions de chantier (logique pure,
// testée dans __tests__/crReponse.test.js).
//
// Chaque entreprise reçoit avec le compte rendu un lien sans compte
// (/actions/<jeton>, table cr_liens, migration 046) : pour chacune de ses
// actions ouvertes, elle répond « c'est fait » (photo possible), « j'ai
// besoin de plus de temps » (nouvelle date) ou « je ne suis pas d'accord »
// (commentaire). La réponse est gardée sur la tâche (taches.reponse_entreprise)
// et pré-remplit le compte rendu suivant. Deux jours avant une échéance, un
// rappel avec le même lien part automatiquement (/api/cron/echeances).

import { addDaysISO } from './today'

export const LIEN_JOURS = 60
export const RAPPEL_JOURS = 2

export const REPONSES = [
  { code: 'fait', label: 'C’est fait', court: 'Fait' },
  { code: 'delai', label: 'J’ai besoin de plus de temps', court: 'Plus de temps demandé' },
  { code: 'desaccord', label: 'Je ne suis pas d’accord', court: 'Désaccord' },
]
export const reponseOf = (code) => REPONSES.find(r => r.code === code) || null

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const day = (v) => (v ? String(v).slice(0, 10) : '')
const fmt = (iso) => (day(iso) ? day(iso).split('-').reverse().join('/') : '')
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim()

/** Même entreprise (casse, accents et ponctuation ignorés). */
export function sameEntreprise(a, b) {
  const x = fold(a), y = fold(b)
  if (!x || !y) return false
  return x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)))
}

/** URL de la page de réponse. */
export const actionsUrl = (origin, token) => `${String(origin || '').replace(/\/$/, '')}/actions/${token}`
export const isLienToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)

/** Actions ouvertes d'une entreprise sur un chantier (page publique). */
export function openActionsFor(tasks = [], entreprise) {
  return tasks.filter(t => t.statut !== 'Terminé' && sameEntreprise(t.entreprise, entreprise))
    .sort((a, b) => (Number(a.num_point) || 9999) - (Number(b.num_point) || 9999))
    .map(t => ({
      id: t.id, num: t.num_point ?? null, titre: t.titre || '', lot: t.lot || '', echeance: day(t.echeance) || null,
      rappels: Number(t.nb_rappels) || 0, reponse: t.reponse_entreprise || null,
    }))
}

/**
 * Réponse envoyée par la page publique, validée.
 * @returns {{ type, date, commentaire } | { error }}
 */
export function parseReponse(body = {}, today) {
  const type = String(body.type || '')
  if (!reponseOf(type)) return { error: 'Choisissez une réponse.' }
  const commentaire = String(body.commentaire || '').trim().slice(0, 1000)
  let date = null
  if (type === 'delai') {
    date = DATE_RE.test(String(body.date || '')) ? String(body.date) : null
    if (!date) return { error: 'Indiquez la nouvelle date.' }
    if (date <= today) return { error: 'La nouvelle date doit être après aujourd’hui.' }
    if (date > addDaysISO(today, 365)) return { error: 'La nouvelle date est trop lointaine.' }
  }
  if (type === 'desaccord' && commentaire.length < 5) return { error: 'Expliquez en quelques mots votre désaccord.' }
  return { type, date, commentaire }
}

/** Phrase courte d'une réponse : « Fait », « Plus de temps demandé : 20/10/2026 »… */
export function reponseText(rep) {
  const r = reponseOf(rep?.type)
  if (!r) return ''
  return [
    r.court + (rep.type === 'delai' && rep.date ? ` : nouvelle date le ${fmt(rep.date)}` : ''),
    rep.commentaire ? `« ${rep.commentaire} »` : null,
  ].filter(Boolean).join(' — ')
}

/** Réponse arrivée depuis le CR précédent (sinon déjà traitée en réunion). */
export function isRecentReponse(rep, sinceDate) {
  if (!rep?.type || !rep.le) return false
  return !day(sinceDate) || day(rep.le) > day(sinceDate)
}

/**
 * Point du nouveau CR pré-rempli d'après la réponse de l'entreprise :
 * fait → « Fait » (photo jointe au point) ; plus de temps → nouvelle
 * échéance, « En cours » ; désaccord → inchangé (à trancher en réunion).
 */
export function applyReponse(row, sinceDate) {
  const rep = row?.reponse
  if (!isRecentReponse(rep, sinceDate)) return row
  const out = { ...row, reponseRecente: true }
  if (rep.type === 'fait') {
    out.suivi = 'fait'
    out.vu = true
    if (rep.photo && !(row.photos || []).some(p => p.path === rep.photo)) {
      out.photos = [...(row.photos || []), { path: rep.photo, legende: 'Photo envoyée par l’entreprise' }]
    }
  } else if (rep.type === 'delai') {
    out.suivi = 'en_cours'
    out.vu = true
    if (rep.date) out.echeance = rep.date
  }
  return out
}

// ─── Rappel avant échéance ────────────────────────────────────────────────
/**
 * Actions à rappeler aujourd'hui : échéance dans 1 à 2 jours (jusqu'à
 * 4 jours le vendredi, pour couvrir lundi et mardi), entreprise connue,
 * chantier en cours, pas encore rappelée pour cette échéance.
 */
export function dueEcheances(tasks = [], { today, weekday, closedChantiers = new Set() } = {}) {
  const span = weekday === 5 ? 4 : RAPPEL_JOURS
  const max = addDaysISO(today, span)
  return tasks.filter(t => t.statut !== 'Terminé' && String(t.entreprise || '').trim() && t.chantier_id
    && !closedChantiers.has(t.chantier_id)
    && day(t.echeance) > today && day(t.echeance) <= max
    && day(t.rappel_echeance) !== day(t.echeance))
}

/**
 * Adresse d'une entreprise : intervenant du dernier CR du chantier, sinon
 * contact (email travaux d'abord).
 */
export function emailFor(entreprise, { intervenants = [], contacts = [] } = {}) {
  const it = intervenants.find(i => i?.email && (sameEntreprise(i.societe, entreprise) || sameEntreprise(i.nom, entreprise)))
  if (it) return { email: it.email, nom: it.nom || '' }
  const c = contacts.find(x => (x.email_travaux || x.email) && (sameEntreprise(x.societe, entreprise) || sameEntreprise(x.nom, entreprise)))
  return c ? { email: c.email_travaux || c.email, nom: c.nom || '' } : null
}

const LINK_INTRO = 'Merci de nous indiquer où vous en êtes (c’est fait, besoin de plus de temps, désaccord), sans créer de compte :'

/** Paragraphe du lien de réponse, dans le texte des mails. */
export const linkParagraph = (link) => (link ? `${LINK_INTRO}\n${link}` : null)

/** Texte du mail sans le paragraphe du lien (version HTML : un bouton le remplace). */
export const withoutLinkParagraph = (text) => String(text || '').split('\n\n').filter(p => !p.startsWith(LINK_INTRO)).join('\n\n')

/** Mail de rappel avant échéance. */
export function echeanceMailText({ nom, chantier, actions = [], link, company = {} }) {
  const lines = actions.map(a => `  • ${a.num_point ? `n°${a.num_point} ` : ''}${a.titre} — pour le ${fmt(a.echeance)}`)
  return [
    `Bonjour${nom ? ` ${nom}` : ''},`,
    `Pour rappel, ${actions.length > 1 ? 'ces actions sont attendues' : 'cette action est attendue'} sur le chantier ${chantier || ''} dans les prochains jours :`,
    lines.join('\n'),
    linkParagraph(link),
    `Cordialement,\n${company.nom || ''}`.trim(),
  ].filter(Boolean).join('\n\n')
}
