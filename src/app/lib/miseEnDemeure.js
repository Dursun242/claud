// Courrier de mise en demeure d'une entreprise (logique pure, testée dans
// __tests__/miseEnDemeure.test.js) : proposé quand une action a été relancée
// trois fois sans effet au compte rendu (crSuivi.MISE_EN_DEMEURE_RAPPELS).
// Le texte sert au PDF (generators.generateMiseEnDemeurePdf) et au mail.
// À envoyer en recommandé avec accusé de réception : le mail n'en est qu'une
// copie.

import { MISE_EN_DEMEURE_RAPPELS, relanceLevel } from './crSuivi'
import { sameEntreprise } from './crReponse'

export const DELAI_DEFAUT = 8

const day = (v) => (v ? String(v).slice(0, 10) : '')
const fmt = (iso) => (day(iso) ? day(iso).split('-').reverse().join('/') : '')
const lc = (t) => String(t || '').trim().replace(/[.\s]+$/, '').replace(/^[A-ZÀ-Ý](?=[a-zà-ÿ])/, c => c.toLowerCase())

/** Un point appelle une mise en demeure (relancé 3 fois, toujours ouvert). */
export const needsMiseEnDemeure = (r) => !!r && r.suivi !== 'fait' && !r.missing
  && (Number(r.rappels) || 0) >= MISE_EN_DEMEURE_RAPPELS && !!String(r.entreprise || '').trim()

/**
 * Entreprises à mettre en demeure d'après les points du CR, avec leurs
 * points en souffrance (relancés au moins deux fois).
 * @returns {Array<{ entreprise, points }>}
 */
export function miseEnDemeureCandidates(rows = []) {
  const out = []
  for (const r of rows.filter(needsMiseEnDemeure)) {
    if (out.some(c => sameEntreprise(c.entreprise, r.entreprise))) continue
    out.push({ entreprise: String(r.entreprise).trim(), points: pointsEnSouffrance(rows, r.entreprise) })
  }
  return out
}

/** Points ouverts d'une entreprise déjà relancés (dernier rappel ou plus). */
export function pointsEnSouffrance(rows = [], entreprise) {
  return rows.filter(r => r.suivi !== 'fait' && !r.missing && sameEntreprise(r.entreprise, entreprise)
    && ((Number(r.rappels) || 0) >= 2 || relanceLevel(r) === 2))
    .sort((a, b) => (Number(a.num) || 9999) - (Number(b.num) || 9999))
}

/** Adresse postale d'une entreprise (contact). */
export function adresseOf(contacts = [], entreprise) {
  const c = contacts.find(x => sameEntreprise(x.societe, entreprise)) || contacts.find(x => sameEntreprise(x.nom, entreprise))
  if (!c) return { nom: entreprise, lignes: [], email: '' }
  return {
    nom: c.societe || c.nom || entreprise,
    attention: c.societe && c.nom && c.nom !== c.societe ? c.nom : '',
    lignes: [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].map(l => String(l || '').trim()).filter(Boolean),
    email: c.email_travaux || c.email || '',
  }
}

/**
 * Texte du courrier.
 * @returns {{ objet, paragraphes: string[], points: string[], signature }}
 */
export function miseEnDemeureText({ entreprise, chantier = {}, points = [], delai = DELAI_DEFAUT, date, company = {} }) {
  const lieu = [chantier.nom, chantier.adresse].filter(Boolean).join(', ')
  const lots = [...new Set(points.map(p => String(p.lot || '').trim()).filter(l => l && l !== 'Généralités'))]
  const liste = points.map(p => [
    `${p.num ? `Point n°${p.num} : ` : ''}${String(p.titre || '').trim()}`,
    p.origineNumero || p.origine ? `demandé au compte rendu n°${p.origineNumero || p.origine}` : null,
    p.echeance ? `attendu pour le ${fmt(p.echeance)}` : null,
    p.rappels ? `relancé ${p.rappels} fois` : null,
  ].filter(Boolean).join(', ') + '.')
  return {
    objet: `Mise en demeure — chantier ${chantier.nom || ''}`.trim(),
    paragraphes: [
      'Madame, Monsieur,',
      `Dans le cadre du chantier ${lieu}${chantier.client ? `, réalisé pour le compte de ${chantier.client}` : ''}, votre entreprise ${entreprise} intervient${lots.length ? ` au titre du lot ${lots.join(', ')}` : ''}.`,
      `Malgré les demandes et relances inscrites dans nos comptes rendus de chantier, diffusés à votre entreprise, ${points.length > 1 ? 'les prestations suivantes ne sont toujours pas exécutées' : 'la prestation suivante n’est toujours pas exécutée'} :`,
      '__POINTS__',
      `En conséquence, nous vous mettons en demeure ${points.length > 1 ? 'de les exécuter' : 'de l’exécuter'} dans un délai de ${delai} jours à compter de la réception du présent courrier.`,
      'À défaut, nous nous réservons le droit, en accord avec le maître d’ouvrage et conformément aux dispositions de votre marché, de faire exécuter ces prestations par une autre entreprise à vos frais et risques et d’appliquer les pénalités de retard prévues, sans préjudice de tous dommages et intérêts.',
      'Nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.',
    ],
    points: liste,
    signature: [company.nom, 'Maître d’œuvre'].filter(Boolean).join('\n'),
    date: fmt(date),
    copie: chantier.client ? `Copie : ${chantier.client}, maître d’ouvrage` : '',
  }
}

/** Version texte (corps du mail qui accompagne le PDF). */
export function miseEnDemeureMail({ text, company = {} }) {
  return [
    'Madame, Monsieur,',
    `Veuillez trouver ci-joint notre courrier de mise en demeure du ${text.date} (${lc(text.objet)}), également adressé en recommandé avec accusé de réception.`,
    `Cordialement,\n${company.nom || ''}`.trim(),
  ].join('\n\n')
}
