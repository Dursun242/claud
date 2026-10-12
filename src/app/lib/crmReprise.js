// Relance automatique des affaires « En attente » (migrations 043 et 044).
//
// À la date de reprise, le client reçoit un mail de reprise de contact avec
// des choix de réponse : dans la version HTML chacun est un bouton vers la
// page /reprise/<jeton>?r=<code>, dans la version texte un lien unique et
// une liste numérotée. Logique pure, sans dépendance Node : sert au cron
// /api/cron/reprise, à la route /api/crm/reprise, à la page publique et au CRM.

import { companySignature } from './devis'
import { addMonthsISO, isAttente } from './crm'

/**
 * Choix proposés au client.
 * - label : texte vu par le client (à la première personne)
 * - court : libellé pour l'équipe (CRM, notification)
 * - mois  : pour « toujours en pause », reprise de contact repoussée de N mois
 */
export const CHOIX_REPRISE = [
  { code: 'redemarre', label: 'Mon projet redémarre : vous pouvez me recontacter', court: 'Le projet redémarre' },
  { code: 'pause3', label: 'Toujours en pause : recontactez-moi dans 3 mois', court: 'Toujours en pause (3 mois)', mois: 3 },
  { code: 'pause6', label: 'Toujours en pause : recontactez-moi dans 6 mois', court: 'Toujours en pause (6 mois)', mois: 6 },
  { code: 'abandon', label: 'J’ai abandonné le projet ou choisi une autre solution', court: 'Projet abandonné' },
  { code: 'autre', label: 'Autre', court: 'Autre' },
]
export const choixOf = (code) => CHOIX_REPRISE.find(c => c.code === code) || null

export const MAX_COMMENTAIRE = 1000
// Sans réponse au mail de reprise : rappel dans le CRM à J+14
export const RELANCE_SANS_REPONSE_JOURS = 14
export const ACTION_SANS_REPONSE = 'Reprendre contact (pas de réponse au mail de reprise)'

const day = (v) => (v ? String(v).slice(0, 10) : '')
export const addDaysISO = (iso, n) => {
  const d = new Date(`${day(iso)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Affaires dont le mail de reprise part aujourd'hui : en attente, relance
 * automatique active, date de reprise atteinte, pas encore relancées pour
 * cette date, contact avec un email.
 * @returns {Array<{ opp, contact }>}
 */
export function dueReprises(opps = [], contactsById = new Map(), today) {
  const td = day(today)
  const out = []
  for (const o of opps) {
    if (!isAttente(o?.etape) || o.reprise_auto === false) continue
    const r = day(o.date_reprise)
    if (!r || r > td) continue
    if (o.reprise_envoyee_le && day(o.reprise_envoyee_le) >= r) continue
    const contact = contactsById.get(o.contact_id)
    if (!contact?.email || !String(contact.email).includes('@')) continue
    out.push({ opp: o, contact })
  }
  return out.sort((a, b) => day(a.opp.date_reprise).localeCompare(day(b.opp.date_reprise)))
}

/** Mail de reprise déjà parti pour la date de reprise actuelle. */
export const repriseEnvoyee = (o) =>
  !!(o?.reprise_envoyee_le && o?.date_reprise && day(o.reprise_envoyee_le) >= day(o.date_reprise))

/** Lien de réponse (page publique), avec en option un choix présélectionné. */
export const repriseUrl = (origin, token, code) =>
  `${String(origin).replace(/\/$/, '')}/reprise/${token}${code ? `?r=${encodeURIComponent(code)}` : ''}`

/** Contenu du mail : objet, début (avant les choix) et fin (après les choix). */
export function repriseMailContent({ opp = {}, contact = null, company = {} } = {}) {
  const hello = contact?.nom ? `Bonjour ${contact.nom},` : 'Bonjour,'
  const motif = String(opp.motif_attente || '').trim()
  const pause = motif ? ` (${motif.charAt(0).toLowerCase()}${motif.slice(1)})` : ''
  return {
    subject: 'Où en est votre projet ?',
    intro: [
      hello, '',
      `Lors de nos derniers échanges, vous nous aviez indiqué que votre projet était en pause${pause}. Comme convenu, je reviens vers vous pour savoir où vous en êtes.`, '',
      'Un simple clic sur la réponse qui correspond à votre situation suffit : nous nous adaptons à votre calendrier.',
    ].join('\n'),
    outro: [
      'Si votre projet a évolué (budget, surface, calendrier), nous pouvons tout à fait revoir notre proposition ensemble.', '',
      'Je reste à votre disposition.', '',
      'Bien cordialement,', companySignature(company),
    ].join('\n'),
  }
}

/** Version texte du mail : début, lien de réponse + liste numérotée, fin. */
export function repriseMailText({ intro = '', outro = '', link = '' } = {}) {
  return [
    String(intro).trim(), '',
    link ? `Pour nous répondre en un clic, ouvrez ce lien et choisissez votre réponse :\n${link}\n` : null,
    `${link ? 'Ou répondez' : 'Répondez'} simplement à ce mail avec le numéro qui correspond à votre situation :`,
    ...CHOIX_REPRISE.map((c, i) => `${i + 1}. ${c.code === 'autre' ? 'Autre : …' : c.label}`), '',
    String(outro).trim(),
  ].filter(l => l !== null).join('\n').trim()
}

/** Choix affichés en boutons dans la version HTML (devisMailHtml, param `choices`). */
export const repriseChoices = (origin, token) =>
  CHOIX_REPRISE.map((c, i) => ({ label: `${i + 1}. ${c.code === 'autre' ? 'Autre (précisez)' : c.label}`, url: repriseUrl(origin, token, c.code) }))

/**
 * Valide la réponse envoyée depuis la page publique.
 * @returns {{ choix, commentaire } | { error }}
 */
export function parseReprise(body = {}) {
  const c = choixOf(String(body.choix || ''))
  if (!c) return { error: 'Choisissez une réponse.' }
  const commentaire = String(body.commentaire || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_COMMENTAIRE)
  if (c.code === 'autre' && commentaire.length < 2) return { error: 'Précisez votre réponse dans le champ « Autre ».' }
  return { choix: c.code, commentaire }
}

/**
 * Suite donnée à la réponse du client : changements de l'affaire et échange
 * noté dans le CRM (avec la prochaine action).
 * @param {object} p
 * @param {object} p.opp      affaire (etape, date_reprise…)
 * @param {string} p.choix
 * @param {string} [p.commentaire]
 * @param {boolean} [p.aDesDevis]  l'affaire a déjà un devis (reprise en Négociation)
 * @param {string} p.today    AAAA-MM-JJ
 * @returns {{ patch: object|null, interaction: object, closeFollowUps: 'tous'|'reprise'|null, resume: string }}
 *   patch : colonnes de crm_opportunites à modifier (null : rien, l'affaire n'est plus en attente)
 */
export function repriseSuite({ opp = {}, choix, commentaire = '', aDesDevis = false, today }) {
  const c = choixOf(choix) || choixOf('autre')
  const td = day(today)
  const enAttente = isAttente(opp.etape)
  const interaction = {
    type: 'Email',
    sujet: `Réponse du client à la reprise de contact : ${c.court}`,
    contenu: commentaire ? `« ${commentaire} »` : null,
    prochaine_action: null,
    prochaine_action_date: null,
  }
  if (c.code === 'redemarre') {
    const etape = aDesDevis ? 'Négociation' : 'Qualifié'
    interaction.prochaine_action = 'Rappeler le client (le projet redémarre)'
    interaction.prochaine_action_date = td
    return {
      patch: enAttente ? { etape, date_reprise: null, motif_attente: null } : null,
      interaction, closeFollowUps: 'reprise',
      resume: enAttente ? `L'affaire repasse en « ${etape} » dans le CRM.` : '',
    }
  }
  if (c.mois) {
    const date = addMonthsISO(td, c.mois)
    interaction.prochaine_action = 'Reprendre contact (affaire en attente)'
    interaction.prochaine_action_date = date
    return {
      patch: enAttente ? { date_reprise: date } : null,
      interaction, closeFollowUps: 'reprise',
      resume: enAttente ? `L'affaire reste en attente, nouveau mail de reprise le ${date.split('-').reverse().join('/')}.` : '',
    }
  }
  if (c.code === 'abandon') {
    return {
      patch: enAttente ? { etape: 'Perdu', motif_perte: 'Projet abandonné', date_cloture: td, probabilite: 0, date_reprise: null, motif_attente: null } : null,
      interaction, closeFollowUps: enAttente ? 'tous' : null,
      resume: enAttente ? 'L’affaire est classée perdue (projet abandonné).' : '',
    }
  }
  interaction.prochaine_action = 'Lire la réponse du client'
  interaction.prochaine_action_date = td
  return { patch: null, interaction, closeFollowUps: 'reprise', resume: '' }
}
