// Relance d'un devis resté sans réponse, avec choix de réponse pour le
// client (migration 041). Le mail liste les raisons possibles : dans la
// version HTML chacune est un bouton vers la page /reponse/<jeton>?r=<code>,
// dans la version texte un lien unique + la liste numérotée (le client peut
// aussi répondre au mail avec le numéro). Logique pure, sans dépendance
// Node : sert à la route /api/devis/relance, à la page publique et au CRM.

import { companySignature } from './devis'

/**
 * Raisons proposées au client.
 * - label : texte vu par le client (à la première personne)
 * - court : libellé pour l'équipe (CRM, notification)
 * - ton   : 'perdu' (affaire probablement perdue), 'attente' (projet en pause), 'chaud' (à rappeler)
 * - suite : action programmée dans le CRM quand le client répond ({ action, jours })
 */
export const RAISONS = [
  { code: 'budget', label: 'Le montant dépasse le budget que j’avais prévu', court: 'Budget dépassé', ton: 'chaud', suite: { action: 'Rappeler le client (budget)', jours: 0 } },
  { code: 'concurrent', label: 'J’ai retenu une autre proposition', court: 'Autre proposition retenue', ton: 'perdu', suite: { action: 'Classer l’affaire perdue', jours: 0 } },
  { code: 'reporte', label: 'Mon projet est reporté (financement, permis, terrain, calendrier…)', court: 'Projet reporté', ton: 'attente', suite: { action: 'Reprendre contact (projet reporté)', jours: 60 } },
  { code: 'financement', label: 'J’attends l’accord de ma banque ou de mon financement', court: 'Attente du financement', ton: 'attente', suite: { action: 'Reprendre contact (financement)', jours: 30 } },
  { code: 'abandon', label: 'Mon projet est abandonné', court: 'Projet abandonné', ton: 'perdu', suite: { action: 'Classer l’affaire perdue', jours: 0 } },
  { code: 'besoin', label: 'La prestation proposée ne correspond pas tout à fait à mon besoin', court: 'Prestation à revoir', ton: 'chaud', suite: { action: 'Rappeler le client (prestation à revoir)', jours: 0 } },
  { code: 'delais', label: 'Les délais proposés ne me conviennent pas', court: 'Délais', ton: 'chaud', suite: { action: 'Rappeler le client (délais)', jours: 0 } },
  { code: 'rdv', label: 'J’ai besoin d’explications ou d’un rendez-vous avant de décider', court: 'Demande un rendez-vous', ton: 'chaud', suite: { action: 'Proposer un rendez-vous', jours: 0 } },
  { code: 'interesse', label: 'Je suis toujours intéressé(e), je reviens vers vous prochainement', court: 'Toujours intéressé', ton: 'attente', suite: { action: 'Relancer le devis', jours: 14 } },
  { code: 'autre', label: 'Autre', court: 'Autre', ton: 'chaud', suite: { action: 'Lire la réponse du client', jours: 0 } },
]

export const raisonOf = (code) => RAISONS.find(r => r.code === code) || null

export const TON_COLORS = {
  perdu: { color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  attente: { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  chaud: { color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
}

export const MAX_COMMENTAIRE = 1000

/**
 * Valide la réponse envoyée depuis la page publique.
 * @returns {{ raison, commentaire } | { error }}
 */
export function parseReponse(body = {}) {
  const r = raisonOf(String(body.raison || ''))
  if (!r) return { error: 'Choisissez une réponse.' }
  const commentaire = String(body.commentaire || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_COMMENTAIRE)
  if (r.code === 'autre' && commentaire.length < 2) return { error: 'Précisez votre réponse dans le champ « Autre ».' }
  return { raison: r.code, commentaire }
}

/** Lien de réponse (page publique) pour un jeton et, en option, une raison présélectionnée. */
export const reponseUrl = (origin, token, code) =>
  `${String(origin).replace(/\/$/, '')}/reponse/${token}${code ? `?r=${encodeURIComponent(code)}` : ''}`

const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

/**
 * Texte proposé dans la fenêtre de relance (modifiable) : début du message
 * (avant les choix) et fin (après les choix).
 */
export function relanceMailContent(devis = {}, contact = null, company = {}) {
  const hello = contact?.nom ? `Bonjour ${contact.nom},` : 'Bonjour,'
  const envoi = devis.date_envoi ? ` le ${fmtD(devis.date_envoi)}` : ''
  const objet = devis.objet ? ` pour « ${devis.objet} »` : ''
  return {
    to: contact?.email || '',
    subject: `Votre devis ${devis.numero} : un petit retour ?`,
    intro: [
      hello, '',
      `Je reviens vers vous au sujet du devis ${devis.numero} que nous vous avons adressé${envoi}${objet}.`, '',
      'Sans nouvelles de votre part, je me permets de vous demander où en est votre réflexion. Votre retour, même négatif, nous aide beaucoup à nous améliorer.',
    ].join('\n'),
    outro: [
      'Si le budget ou le contenu de la mission vous freine, nous pouvons tout à fait revoir la proposition ensemble.', '',
      'Je reste à votre disposition.', '',
      'Bien cordialement,', companySignature(company),
    ].join('\n'),
  }
}

/** Version texte du mail : début, lien de réponse + liste numérotée, fin. */
export function relanceMailText({ intro = '', outro = '', link = '' } = {}) {
  return [
    String(intro).trim(), '',
    link ? `Pour nous répondre en un clic, ouvrez ce lien et choisissez votre réponse :\n${link}\n` : null,
    `${link ? 'Ou répondez' : 'Répondez'} simplement à ce mail avec le numéro qui correspond à votre situation :`,
    ...RAISONS.map((r, i) => `${i + 1}. ${r.code === 'autre' ? 'Autre : …' : r.label}`), '',
    String(outro).trim(),
  ].filter(l => l !== null).join('\n').trim()
}

/** Choix affichés en boutons dans la version HTML (devisMailHtml, param `choices`). */
export const relanceChoices = (origin, token) =>
  RAISONS.map((r, i) => ({ label: `${i + 1}. ${r.code === 'autre' ? 'Autre (précisez)' : r.label}`, url: reponseUrl(origin, token, r.code) }))

/**
 * Interaction notée dans le CRM quand le client répond : sujet, contenu,
 * prochaine action (selon la raison).
 */
export function reponseInteraction({ devis = {}, raison, commentaire = '', today }) {
  const r = raisonOf(raison) || raisonOf('autre')
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (r.suite.jours || 0))
  return {
    type: 'Email',
    sujet: `Réponse du client au devis ${devis.numero} : ${r.court}`,
    contenu: commentaire ? `« ${commentaire} »` : null,
    prochaine_action: r.suite.action,
    prochaine_action_date: d.toISOString().slice(0, 10),
  }
}
