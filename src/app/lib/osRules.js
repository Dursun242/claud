// Règles des ordres de service : calcul des montants, cycle de vie
// (statuts et passages autorisés), OS figé une fois en signature ou signé,
// contrôles avant enregistrement, brouillon d'un nouvel OS.
//
// Source unique pour le formulaire (OsEditor), la page Ordres de service,
// la fiche chantier et les PDF / Excel : tout le monde compte de la même
// façon. Logique pure, testée dans __tests__/osRules.test.js.

import { nextOsNumero } from './osNumero'

export const OS_STATUTS = ['Brouillon', 'Émis', 'Signé', 'En cours', 'Terminé', 'Annulé']

// Passages de statut autorisés depuis chaque statut (le statut courant
// reste toujours possible). On avance dans l'ordre ; les retours prévus :
// Émis → Brouillon (OS repris avant signature), Terminé → En cours
// (réserve à reprendre), Annulé → Brouillon (OS réactivé).
const TRANSITIONS = {
  'Brouillon': ['Émis', 'Annulé'],
  'Émis':      ['Brouillon', 'Signé', 'Annulé'],
  'Signé':     ['En cours', 'Annulé'],
  'En cours':  ['Terminé', 'Annulé'],
  'Terminé':   ['En cours'],
  'Annulé':    ['Brouillon'],
}

export const DEFAULT_CONDITIONS = 'Paiement à 30 jours à compter de la réception de la facture.'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v) => {
  if (v === '' || v == null) return NaN
  return Number(String(v).replace(',', '.').replace(/\s/g, ''))
}

/** Taux de TVA d'une ligne : 0 % reste 0 % ; 20 % seulement si le taux est absent. */
export function tvaRate(p, tvaNonApplicable = false) {
  if (tvaNonApplicable) return 0
  const t = num(p?.tva_taux)
  return Number.isFinite(t) && t >= 0 ? t : 20
}

/** Montant HT d'une ligne (quantité × prix unitaire), au centime. */
export function lineHT(p) {
  const q = num(p?.quantite)
  const pu = num(p?.prix_unitaire)
  if (!Number.isFinite(q) || !Number.isFinite(pu)) return 0
  return round2(q * pu)
}

/**
 * Totaux d'un OS. La TVA est calculée par taux (comme sur le PDF), puis
 * arrondie au centime.
 * @returns {{ ht: number, tva: number, ttc: number, parTaux: Record<string, number> }}
 */
export function computeOsTotals(prestations = [], tvaNonApplicable = false) {
  let ht = 0
  const baseParTaux = {}
  for (const p of prestations || []) {
    const l = lineHT(p)
    if (!l) continue
    ht += l
    const t = tvaRate(p, tvaNonApplicable)
    baseParTaux[t] = (baseParTaux[t] || 0) + l
  }
  const parTaux = {}
  let tva = 0
  for (const [t, base] of Object.entries(baseParTaux)) {
    const v = round2(base * Number(t) / 100)
    parTaux[t] = v
    tva += v
  }
  ht = round2(ht)
  tva = round2(tva)
  return { ht, tva, ttc: round2(ht + tva), parTaux }
}

const isBlankLine = (p) =>
  !String(p?.description || '').trim() && !String(p?.quantite ?? '').trim() && !String(p?.prix_unitaire ?? '').trim()

/** Lignes enregistrées : sans les lignes vides, taux à 0 si TVA non applicable. */
export function cleanPrestations(prestations = [], tvaNonApplicable = false) {
  return (prestations || [])
    .filter(p => !isBlankLine(p))
    .map(p => ({
      description: String(p.description || '').trim(),
      unite: p.unite || 'u',
      quantite: String(p.quantite ?? '').trim(),
      prix_unitaire: String(p.prix_unitaire ?? '').trim(),
      tva_taux: tvaNonApplicable ? '0' : String(tvaRate(p)),
    }))
}

// ─── Cycle de vie ───────────────────────────────────────────────

/** Statuts proposés pour un OS au statut donné (courant + passages autorisés). */
export function statutsPossibles(statut) {
  const cur = OS_STATUTS.includes(statut) ? statut : 'Brouillon'
  const next = TRANSITIONS[cur] || []
  return OS_STATUTS.filter(s => s === cur || next.includes(s))
}

export function canChangeStatut(from, to) {
  if (!to || from === to) return true
  return statutsPossibles(from || 'Brouillon').includes(to)
}

const SIGNATURE_EN_COURS = ['Envoyé', 'Partiellement signé']

/**
 * Raison pour laquelle le contenu de l'OS est figé, ou null s'il est
 * modifiable. Signé, en cours ou terminé : l'entreprise s'est engagée sur
 * ce document, un changement passe par un nouvel OS (avenant). Envoyé en
 * signature : le PDF est chez les signataires, il faut d'abord
 * réinitialiser la signature.
 */
export function osLockReason(os) {
  if (!os?.id) return null
  if (os.statut_signature === 'Signé' || ['Signé', 'En cours', 'Terminé'].includes(os.statut)) {
    return "OS signé : son contenu est figé. Seul le statut change. Pour modifier les travaux ou les prix, dupliquez-le (avenant)."
  }
  if (SIGNATURE_EN_COURS.includes(os.statut_signature)) {
    return "OS en cours de signature : son contenu est figé. Réinitialisez la signature pour le modifier."
  }
  return null
}

const osLabel = (os) => (os?.numero ? `L'OS ${os.numero}` : "L'OS")

/** Un OS signé ou engagé ne se supprime pas : il s'annule. */
export function deleteBlockReason(os) {
  if (!os) return null
  if (os.statut_signature === 'Signé' || ['Signé', 'En cours', 'Terminé'].includes(os.statut)) {
    return `${osLabel(os)} est signé : passez-le en « Annulé » plutôt que de le supprimer.`
  }
  if (SIGNATURE_EN_COURS.includes(os.statut_signature)) {
    return `${osLabel(os)} est en cours de signature : réinitialisez la signature avant de le supprimer.`
  }
  return null
}

// ─── Contrôles ──────────────────────────────────────────────────

const normNumero = (n) => String(n || '').trim().toUpperCase().replace(/\s+/g, '')

/**
 * Contrôle un OS avant enregistrement.
 * @param {object} form          champs de l'OS (avec id en modification)
 * @param {Array}  prestations   lignes saisies
 * @param {object} ctx           { allOs: tous les OS connus, previous: OS avant modification }
 * @returns {string|null} message d'erreur, ou null si tout est bon
 */
export function validateOs(form = {}, prestations = [], { allOs = [], previous = null } = {}) {
  const numero = String(form.numero || '').trim()
  if (!numero) return "Le numéro d'OS est requis."
  const doublon = (allOs || []).find(o => o.id !== form.id && normNumero(o.numero) === normNumero(numero))
  if (doublon) return `Le numéro ${numero} est déjà pris par un autre OS.`
  if (!form.chantier_id) return 'Choisissez le chantier.'
  if (!String(form.artisan_nom || '').trim()) return "Choisissez l'entreprise destinataire."

  if (previous && !canChangeStatut(previous.statut, form.statut)) {
    return `Passage de « ${previous.statut} » à « ${form.statut} » impossible.`
  }

  // Un OS figé garde ses lignes : pas de contrôle à refaire sur le contenu.
  if (previous && osLockReason(previous)) return null

  const lignes = (prestations || []).filter(p => !isBlankLine(p))
  if (lignes.length === 0) return 'Ajoutez au moins une prestation.'
  for (let i = 0; i < lignes.length; i++) {
    const p = lignes[i]
    const n = i + 1
    if (!String(p.description || '').trim()) return `Ligne ${n} : la description manque.`
    const q = num(p.quantite)
    if (!Number.isFinite(q) || q <= 0) return `Ligne ${n} : la quantité doit être supérieure à 0.`
    const pu = num(p.prix_unitaire)
    if (!Number.isFinite(pu) || pu < 0) return `Ligne ${n} : le prix unitaire est invalide.`
  }
  if (computeOsTotals(lignes, form.tva_non_applicable).ht <= 0) return 'Le montant HT de l\'OS est nul.'

  if (form.statut && form.statut !== 'Brouillon' && form.statut !== 'Annulé' && !form.date_emission) {
    return "Indiquez la date d'émission."
  }
  if (form.date_intervention && form.date_fin_prevue && form.date_fin_prevue < form.date_intervention) {
    return 'La date de fin prévue est avant la date de début des travaux.'
  }
  return null
}

// ─── Brouillons ─────────────────────────────────────────────────

export const BLANK_LINE = { description: '', unite: 'u', quantite: '', prix_unitaire: '', tva_taux: '20' }

const todayISO = (now = new Date()) => {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}

/** Nouvel OS vierge pour un chantier. */
export function newOsDraft({ chantier = null, allOs = [], now = new Date() } = {}) {
  return {
    numero: nextOsNumero(allOs, now),
    chantier_id: chantier?.id || '',
    client_nom: chantier?.client || '',
    client_adresse: '',
    artisan_nom: '', artisan_specialite: '', artisan_adresse: '',
    artisan_tel: '', artisan_email: '', artisan_siret: '',
    date_emission: todayISO(now), date_intervention: '', date_fin_prevue: '',
    observations: '', conditions: DEFAULT_CONDITIONS,
    statut: 'Brouillon',
    tva_non_applicable: false,
    lot: '',
  }
}

const COPY_FIELDS = [
  'client_nom', 'client_adresse',
  'artisan_nom', 'artisan_specialite', 'artisan_adresse', 'artisan_tel', 'artisan_email', 'artisan_siret',
  'observations', 'conditions', 'tva_non_applicable', 'lot',
]

/**
 * Nouvel OS repris d'un autre (duplication, avenant, modèle) : nouveau
 * numéro, brouillon daté du jour, sans signature ni dates de travaux.
 * Un chantier donné remplace celui de l'OS d'origine.
 */
export function draftFromOs(source = {}, { chantier = null, allOs = [], now = new Date() } = {}) {
  const base = newOsDraft({ chantier, allOs, now })
  const draft = { ...base }
  for (const k of COPY_FIELDS) if (source[k] != null) draft[k] = source[k]
  if (!chantier) {
    draft.chantier_id = source.chantier_id || ''
  } else if (source.chantier_id && source.chantier_id !== chantier.id) {
    // Autre chantier : le client est celui du chantier, pas celui du modèle
    draft.client_nom = chantier.client || ''
    draft.client_adresse = ''
    draft.lot = ''
  }
  draft.conditions = draft.conditions || DEFAULT_CONDITIONS
  draft.tva_non_applicable = !!draft.tva_non_applicable
  const prestations = (source.prestations || []).map(p => ({
    description: p.description || '',
    unite: p.unite || 'u',
    quantite: String(p.quantite ?? ''),
    prix_unitaire: String(p.prix_unitaire ?? ''),
    tva_taux: String(tvaRate(p)),
  }))
  return { form: draft, prestations: prestations.length ? prestations : [{ ...BLANK_LINE }] }
}

/** Lignes d'un OS existant, prêtes pour le formulaire (champs texte). */
export function editablePrestations(os = {}) {
  const lines = (os.prestations || []).map(p => ({
    ...p,
    unite: p.unite || 'u',
    quantite: String(p.quantite ?? ''),
    prix_unitaire: String(p.prix_unitaire ?? ''),
    tva_taux: String(tvaRate(p, !!os.tva_non_applicable)),
  }))
  return lines.length ? lines : [{ ...BLANK_LINE }]
}
