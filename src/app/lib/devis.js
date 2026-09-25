/**
 * Logique métier pure du module Devis (aucune dépendance React / Supabase).
 *
 * - Statuts, taux de TVA et unités proposés
 * - Calcul des totaux (HT brut, remise, HT net, TVA par taux, TTC, acompte)
 * - Numérotation AA-NNN (ex. 26-050)
 * - Pré-remplissage d'un devis depuis une opportunité
 * - Validation du formulaire
 *
 * Testé dans __tests__/devis.test.js.
 */

export const DEVIS_STATUTS = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé']

export const DEVIS_STATUT_COLORS = {
  'Brouillon': '#64748B',
  'Envoyé':    '#8B5CF6',
  'Accepté':   '#10B981',
  'Refusé':    '#EF4444',
}

// Taux usuels en bâtiment : 20 % (neuf), 10 % (rénovation logement > 2 ans),
// 5,5 % (rénovation énergétique), 0 % (autoliquidation / exonéré).
export const TVA_TAUX = [20, 10, 5.5, 0]
export const UNITES = ['u', 'forfait', 'ens', 'm²', 'ml', 'm³', 'h', 'j', 'kg']

export const VALIDITE_JOURS = 30

export const DEFAULT_CONDITIONS =
  "Acompte à la commande, solde à l'achèvement des prestations.\n" +
  "Paiement par virement à 30 jours date de facture.\n" +
  "Devis valable 30 jours à compter de sa date d'émission. " +
  "Bon pour accord : date, signature et mention « lu et approuvé »."

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

export const blankLigne = (tva = 20) => ({
  type: 'ligne', designation: '', unite: 'u', quantite: '1', prix_unitaire: '', tva_taux: String(tva),
})
export const blankTitre = () => ({ type: 'titre', designation: '' })

/** Montant HT d'une ligne (0 pour un titre de section). */
export function ligneTotal(l = {}) {
  if (l.type === 'titre') return 0
  return round2(num(l.quantite) * num(l.prix_unitaire))
}

/**
 * Totaux du devis. La remise globale s'applique à chaque ligne avant TVA
 * (ventilation correcte quand plusieurs taux coexistent).
 * @returns {{ htBrut, remise, ht, tvaParTaux: Array<{taux, base, montant}>, tva, ttc, acompte }}
 */
export function computeDevisTotals(lignes = [], { remise_pct = 0, acompte_pct = 0 } = {}) {
  const r = Math.min(100, Math.max(0, num(remise_pct))) / 100
  let htBrut = 0
  const bases = new Map()
  for (const l of lignes) {
    if (l.type === 'titre') continue
    const t = ligneTotal(l)
    htBrut += t
    const taux = num(l.tva_taux)
    bases.set(taux, (bases.get(taux) || 0) + t * (1 - r))
  }
  htBrut = round2(htBrut)
  const remise = round2(htBrut * r)
  const ht = round2(htBrut - remise)
  const tvaParTaux = [...bases.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, base]) => ({ taux, base: round2(base), montant: round2(base * taux / 100) }))
  const tva = round2(tvaParTaux.reduce((s, x) => s + x.montant, 0))
  const ttc = round2(ht + tva)
  const acompte = round2(ttc * Math.min(100, Math.max(0, num(acompte_pct))) / 100)
  return { htBrut, remise, ht, tvaParTaux, tva, ttc, acompte }
}

// Premier numéro par année, pour reprendre la numérotation existante
// (devis déjà émis hors application). Années absentes : départ à 1.
export const NUMERO_DEPART = { 2026: 50 }

/**
 * Prochain numéro de devis pour l'année de `date` : AA-NNN (ex. 26-050).
 * Se base sur les numéros existants (toutes affaires confondues) et ne
 * descend jamais sous NUMERO_DEPART pour l'année.
 */
export function nextDevisNumero(existing = [], date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getFullYear()
  const yy = String(year).slice(-2)
  const re = new RegExp(`^${yy}-(\\d+)$`)
  let max = 0
  for (const dv of existing) {
    const m = re.exec(String(dv?.numero || '').trim())
    if (m) max = Math.max(max, Number(m[1]))
  }
  const n = Math.max(max + 1, NUMERO_DEPART[year] || 1)
  return `${yy}-${String(n).padStart(3, '0')}`
}

// Numéro provisoire d'un devis pas encore enregistré dans Qonto : c'est
// Qonto qui attribue le numéro définitif (repris ensuite dans le CRM).
export const PROVISOIRE_PREFIX = 'PROV-'
export const isNumeroProvisoire = (numero) => String(numero || '').startsWith(PROVISOIRE_PREFIX)
export const numeroProvisoire = () =>
  `${PROVISOIRE_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
/** Numéro affiché : « N° Qonto en attente » tant que Qonto ne l'a pas attribué. */
export const numeroAffiche = (numero) => (isNumeroProvisoire(numero) ? 'N° Qonto en attente' : numero)

const isoDay = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}

/**
 * Nouveau devis pré-rempli depuis l'affaire : objet = titre, TVA 10 % par
 * défaut en rénovation (20 % sinon), première ligne = mission au forfait
 * au montant estimé s'il est connu.
 */
export function devisFromOpportunite(opp = {}, existing = [], today = new Date()) {
  const emission = isoDay(today)
  const tva = /rénovation|réhabilitation|aménagement/i.test(opp.type_projet || '') ? 10 : 20
  const montant = num(opp.montant_estime)
  const first = blankLigne(tva)
  if (montant > 0) {
    first.designation = opp.titre || ''
    first.unite = 'forfait'
    first.prix_unitaire = String(montant)
  }
  return {
    opportunite_id: opp.id || null,
    numero: nextDevisNumero(existing, today),
    statut: 'Brouillon',
    objet: opp.titre || '',
    date_emission: emission,
    date_validite: addDaysISO(emission, VALIDITE_JOURS),
    lignes: [first],
    remise_pct: '',
    acompte_pct: '30',
    conditions: DEFAULT_CONDITIONS,
    notes: '',
  }
}

/** Copie d'un devis existant (nouvelle version, statut Brouillon). */
export function duplicateDevis(devis = {}, existing = [], today = new Date()) {
  const emission = isoDay(today)
  const { id: _id, created_at: _c, updated_at: _u, created_by: _b, date_envoi: _e, date_reponse: _r, ...rest } = devis
  return {
    ...rest,
    numero: nextDevisNumero(existing, today),
    statut: 'Brouillon',
    date_emission: emission,
    date_validite: addDaysISO(emission, VALIDITE_JOURS),
    lignes: (devis.lignes || []).map(l => ({ ...l })),
  }
}

/** Valide le formulaire. Retourne un message d'erreur ou "". */
export function validateDevis(form = {}) {
  if (!form.numero || !String(form.numero).trim()) return 'Le numéro est requis.'
  if (!DEVIS_STATUTS.includes(form.statut || 'Brouillon')) return 'Statut invalide.'
  const lignes = (form.lignes || []).filter(l => l.type !== 'titre')
  if (!lignes.length) return 'Ajoute au moins une ligne.'
  for (const [i, l] of lignes.entries()) {
    if (!String(l.designation || '').trim()) return `Ligne ${i + 1} : la désignation est requise.`
    if (num(l.quantite) <= 0) return `Ligne ${i + 1} : la quantité doit être positive.`
    if (num(l.prix_unitaire) < 0) return `Ligne ${i + 1} : le prix ne peut pas être négatif.`
  }
  const r = num(form.remise_pct)
  if (r < 0 || r > 100) return 'La remise doit être comprise entre 0 et 100 %.'
  const a = num(form.acompte_pct)
  if (a < 0 || a > 100) return "L'acompte doit être compris entre 0 et 100 %."
  if (form.date_validite && form.date_emission && form.date_validite < form.date_emission)
    return 'La date de validité précède la date d’émission.'
  return ''
}

/** Normalise les lignes pour la persistance (nombres, titres vides retirés). */
export function normalizeLignes(lignes = []) {
  return lignes
    .filter(l => l.type !== 'titre' || String(l.designation || '').trim())
    .map(l => (l.type === 'titre'
      ? { type: 'titre', designation: String(l.designation).trim() }
      : {
          type: 'ligne',
          designation: String(l.designation || '').trim(),
          unite: l.unite || 'u',
          quantite: num(l.quantite),
          prix_unitaire: num(l.prix_unitaire),
          tva_taux: num(l.tva_taux),
        }))
}

/** Devis envoyé depuis plus de `days` jours sans réponse. */
export function isDevisStale(devis = {}, today = new Date(), days = 7) {
  if (devis.statut !== 'Envoyé' || !devis.date_envoi) return false
  return devis.date_envoi <= addDaysISO(isoDay(today), -days)
}

/** Devis expiré (date de validité dépassée, pas encore accepté / refusé). */
export function isDevisExpired(devis = {}, today = new Date()) {
  if (!devis.date_validite || devis.statut === 'Accepté' || devis.statut === 'Refusé') return false
  return devis.date_validite < isoDay(today)
}

/** Corps du mail d'envoi (mailto:). */
/** Contenu par défaut du mail d'envoi : { to, subject, body }. */
export function devisMailContent(devis = {}, contact = null, company = {}) {
  const totals = computeDevisTotals(devis.lignes, devis)
  const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const subject = `Devis ${devis.numero}${devis.objet ? ` — ${devis.objet}` : ''}`
  const hello = contact?.nom ? `Bonjour ${contact.nom},` : 'Bonjour,'
  const body = [
    hello, '',
    `Veuillez trouver ci-joint notre devis ${devis.numero}${devis.objet ? ` relatif à « ${devis.objet} »` : ''}, ` +
      `d'un montant de ${fmt(totals.ht)} € HT (${fmt(totals.ttc)} € TTC).`,
    devis.date_validite ? `Il est valable jusqu'au ${devis.date_validite.split('-').reverse().join('/')}.` : '',
    '', 'Je reste à votre disposition pour en discuter.', '',
    'Cordialement,', companySignature(company),
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
  return { to: contact?.email || '', subject, body }
}

/** Signature courte de la société (gérant — raison sociale). */
export function companySignature(company = {}) {
  return company.gerant ? `${company.gerant} — ${company.nom || ''}`.trim() : (company.nom || '')
}

/** Lien mailto: (repli quand l'envoi direct n'est pas configuré). */
export function devisMailto(devis = {}, contact = null, company = {}) {
  const { to, subject, body } = devisMailContent(devis, contact, company)
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
