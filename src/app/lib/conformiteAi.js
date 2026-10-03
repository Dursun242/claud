// Lecture par l'IA d'un document administratif d'entreprise (Kbis,
// décennale, attestation fiscale, attestation URSSAF) : schéma de sortie,
// consigne et nettoyage de la réponse. Logique pure (pas d'appel réseau).
// Tests : __tests__/conformiteAi.test.js.

import { DOC_META, isIsoDate } from './conformite'

const KINDS_AI = ['kbis', 'decennale', 'fiscale', 'urssaf', 'rib', 'autre']

export const DOC_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type_document', 'raison_sociale', 'siret', 'date_document', 'valide_du', 'valide_au',
    'assureur', 'numero_police', 'activites', 'activite_couverte', 'code_securite', 'iban', 'bic', 'anomalies'],
  properties: {
    type_document: { type: 'string', enum: KINDS_AI },
    raison_sociale: { type: 'string' },
    siret: { type: 'string' },
    date_document: { type: 'string' },
    valide_du: { type: 'string' },
    valide_au: { type: 'string' },
    assureur: { type: 'string' },
    numero_police: { type: 'string' },
    activites: { type: 'string' },
    activite_couverte: { type: 'string', enum: ['oui', 'non', 'inconnu'] },
    code_securite: { type: 'string' },
    iban: { type: 'string' },
    bic: { type: 'string' },
    anomalies: { type: 'array', items: { type: 'string' } },
  },
}

export const DOC_READ_SYSTEM = `Tu lis des documents administratifs d'entreprises du bâtiment pour un maître d'œuvre français.
Types possibles :
- kbis : extrait Kbis (greffe), extrait D1 du répertoire des métiers ou avis de situation au répertoire SIRENE (INSEE). date_document = date de l'extrait (« à jour au », « délivré le »).
- decennale : attestation d'assurance responsabilité civile décennale. valide_du / valide_au = période de validité de l'attestation. assureur, numero_police, activites = activités ou garanties couvertes (liste courte).
- fiscale : attestation de régularité fiscale (DGFiP). date_document = date de délivrance.
- urssaf : attestation de vigilance URSSAF (ou MSA). date_document = date de délivrance ; code_securite = code de sécurité / de vérification s'il est imprimé.
- rib : relevé d'identité bancaire. raison_sociale = titulaire du compte ; iban (sans espaces) ; bic.
- autre : tout autre document.
Règles :
- Dates au format AAAA-MM-JJ, chaîne vide si absente ou illisible. N'invente rien.
- siret : 14 chiffres sans espace (ou 9 chiffres de SIREN si seul le SIREN figure), chaîne vide sinon.
- valide_au : seulement si une date de fin de validité est écrite sur le document.
- activite_couverte (décennale uniquement) : « oui » si les activités couvertes incluent le métier indiqué par l'utilisateur, « non » si elles ne l'incluent clairement pas, « inconnu » sinon ou pour les autres documents.
- anomalies : problèmes visibles, en phrases courtes en français (document illisible, incomplet, non signé, attestation négative ou avec dettes, entreprise radiée ou en liquidation, période échue…). Liste vide si rien.
Réponds uniquement par l'objet JSON demandé.`

/** Message utilisateur : document attendu + fiche de l'entreprise. */
export function docReadPrompt(kind, contact = {}) {
  const fiche = [
    contact.societe || contact.nom ? `Entreprise : ${contact.societe || contact.nom}` : null,
    contact.siret ? `SIRET de la fiche : ${contact.siret}` : null,
    contact.specialite ? `Métier : ${contact.specialite}` : null,
  ].filter(Boolean).join('\n')
  return `Document attendu : ${DOC_META[kind]?.long || kind}.\n${fiche}\nLis le document joint et remplis le JSON.`
}

const str = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const date = (v) => (isIsoDate(str(v)) ? str(v) : null)
const digits = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 14 || d.length === 9 ? d : null
}

/**
 * Réponse de l'IA → champs de contact_documents (+ anomalies). Le type lu
 * différent du type attendu est signalé comme anomalie.
 */
export function cleanDocRead(raw, expectedKind) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const anomalies = (Array.isArray(r.anomalies) ? r.anomalies : []).map(a => str(a, 200)).filter(Boolean).slice(0, 6)
  const lu = KINDS_AI.includes(r.type_document) ? r.type_document : 'autre'
  if (lu !== expectedKind) {
    anomalies.unshift(lu === 'autre'
      ? `Ce document ne ressemble pas à : ${DOC_META[expectedKind]?.long || expectedKind}.`
      : `Ce document ressemble à : ${DOC_META[lu]?.long}, pas à : ${DOC_META[expectedKind]?.long}.`)
  }
  if (expectedKind === 'decennale' && r.activite_couverte === 'non') {
    anomalies.push('Le métier de l’entreprise ne semble pas couvert par cette attestation.')
  }
  return {
    raison_sociale: str(r.raison_sociale, 200) || null,
    siret_lu: digits(r.siret),
    date_document: date(r.date_document),
    valide_du: date(r.valide_du),
    valide_au: date(r.valide_au),
    assureur: expectedKind === 'decennale' ? (str(r.assureur, 120) || null) : null,
    numero_police: expectedKind === 'decennale' ? (str(r.numero_police, 80) || null) : null,
    activites: expectedKind === 'decennale' ? (str(r.activites, 600) || null) : null,
    code_securite: expectedKind === 'urssaf' ? (str(r.code_securite, 40) || null) : null,
    iban: expectedKind === 'rib' ? (String(r.iban || '').replace(/\s/g, '').toUpperCase().slice(0, 34) || null) : null,
    bic: expectedKind === 'rib' ? (String(r.bic || '').replace(/\s/g, '').toUpperCase().slice(0, 11) || null) : null,
    anomalies,
  }
}
