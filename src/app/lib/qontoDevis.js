/**
 * Conversion d'un devis de l'application vers l'API Qonto (POST /v2/quotes)
 * et rapprochement du client Qonto. Logique pure, utilisée par la route
 * /api/devis/qonto. Testé dans __tests__/qontoDevis.test.js.
 *
 * Formats Qonto : montants et quantités en chaînes, TVA en fraction
 * ("0.2" pour 20 %), remise globale en montant.
 */

import { computeDevisTotals, normalizeLignes, DEFAULT_CONDITIONS } from './devis'

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
const qty = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000)
const vat = (taux) => String(Math.round((Number(taux) || 0) * 10) / 1000)
const cut = (s, max) => String(s ?? '').trim().slice(0, max)
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const TITLE_MAX = 120

/** Corps de la requête Qonto pour créer / mettre à jour le devis. */
// Le numéro n'est pas envoyé : Qonto numérote. `number` n'est passé que si
// Qonto exige un numéro (numérotation automatique désactivée chez lui).
export function toQontoQuote(devis = {}, { clientId, withUnits = true, number } = {}) {
  const lignes = normalizeLignes(devis.lignes)
  const totals = computeDevisTotals(lignes, devis)
  let section = ''
  const items = []
  for (const l of lignes) {
    if (l.type === 'titre') { section = l.designation; continue }
    const long = l.designation.length > TITLE_MAX
    const description = [section, long ? l.designation : ''].filter(Boolean).join(' — ')
    items.push({
      title: long ? `${l.designation.slice(0, TITLE_MAX - 1)}…` : l.designation,
      ...(description ? { description: cut(description, 1000) } : {}),
      quantity: qty(l.quantite),
      ...(withUnits && l.unite ? { unit: l.unite } : {}),
      unit_price: { value: money(l.prix_unitaire), currency: 'EUR' },
      vat_rate: vat(l.tva_taux),
    })
  }
  const footer = [
    Number(devis.acompte_pct) > 0 && totals.acompte > 0
      ? `Acompte de ${String(devis.acompte_pct).replace('.', ',')} % à la commande : ${money(totals.acompte).replace('.', ',')} € TTC.`
      : '',
    cut(devis.notes, 600),
  ].filter(Boolean).join('\n')
  return {
    client_id: clientId,
    ...(number ? { number: cut(number, 40) } : {}),
    issue_date: devis.date_emission,
    expiry_date: devis.date_validite || devis.date_emission,
    currency: 'EUR',
    terms_and_conditions: cut(devis.conditions || DEFAULT_CONDITIONS, 3000),
    ...(devis.objet ? { header: cut(devis.objet, 1000) } : {}),
    ...(footer ? { footer: cut(footer, 1000) } : {}),
    items,
    ...(totals.remise > 0 ? { discount: { type: 'amount', value: money(totals.remise) } } : {}),
  }
}

/** SIREN (9 chiffres) tiré du SIRET / SIREN de la fiche contact, sinon null. */
export function sirenFromContact(contact = {}) {
  const digits = String(contact?.siret || '').replace(/\D/g, '')
  return digits.length === 14 || digits.length === 9 ? digits.slice(0, 9) : null
}

/** Qonto exige le numéro d'identification fiscale (SIREN) du client. */
export function isTinMissing(status, body) {
  if (status !== 422 && status !== 400) return false
  const txt = typeof body === 'string' ? body : JSON.stringify(body || {})
  return /tin_number|tax_identification/i.test(txt)
}

/**
 * Client Qonto à créer à partir du contact de l'affaire : société si le
 * contact a une raison sociale, particulier sinon.
 */
export function qontoClientPayload(contact = {}) {
  const societe = cut(contact.societe, 200)
  const nom = cut(contact.nom, 200)
  const base = {
    ...(contact.email ? { email: cut(contact.email, 200) } : {}),
    ...(contact.adresse ? { address: cut(contact.adresse, 250) } : {}),
    ...(contact.ville ? { city: cut(contact.ville, 100) } : {}),
    ...(contact.code_postal ? { zip_code: cut(contact.code_postal, 20) } : {}),
    country_code: 'FR',
    locale: 'fr',
    currency: 'EUR',
  }
  const tva = String(contact.tva_intra || '').replace(/\s/g, '').toUpperCase()
  if (societe || !nom.includes(' ')) {
    const siren = sirenFromContact(contact)
    return {
      kind: 'company', name: societe || nom,
      ...(/^FR[0-9A-Z]{2}\d{9}$/.test(tva) ? { vat_number: tva } : {}),
      ...(siren ? { tax_identification_number: siren } : {}),
      ...base,
    }
  }
  // Convention « NOM Prénom » : les mots en majuscules forment le nom de
  // famille (« OZKAN Dursun » → Dursun / OZKAN), sinon « Prénom Nom ».
  const words = nom.split(/\s+/)
  const isUpper = (w) => /\p{L}/u.test(w) && w === w.toUpperCase()
  const upper = words.filter(isUpper)
  if (upper.length && upper.length < words.length) {
    return { kind: 'individual', first_name: words.filter(w => !isUpper(w)).join(' '), last_name: upper.join(' '), ...base }
  }
  const [first, ...rest] = words
  return { kind: 'individual', first_name: first, last_name: rest.join(' '), ...base }
}

const clientName = (c = {}) => c.name || [c.first_name, c.last_name].filter(Boolean).join(' ')

/** Retrouve le client Qonto du contact (email d'abord, puis nom). */
export function matchQontoClient(clients = [], contact = {}) {
  const email = String(contact.email || '').trim().toLowerCase()
  if (email) {
    const byEmail = clients.find(c => String(c.email || '').trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const names = [contact.societe, contact.nom].map(norm).filter(Boolean)
  if (!names.length) return null
  return clients.find(c => {
    const n = norm(clientName(c))
    const rev = norm([c.last_name, c.first_name].filter(Boolean).join(' '))
    return n && (names.includes(n) || names.includes(rev))
  }) || null
}

/** Qonto a refusé le numéro parce qu'il existe déjà. */
export function isNumberTaken(status, body) {
  if (status !== 422 && status !== 409) return false
  const txt = typeof body === 'string' ? body : JSON.stringify(body || {})
  return /(^|[^_a-z])number/i.test(txt) && /(taken|already|exist|unique|utilis)/i.test(txt)
}

/** Qonto exige un numéro (numérotation automatique désactivée). */
export function isNumberRequired(status, body) {
  if (status !== 422) return false
  const txt = typeof body === 'string' ? body : JSON.stringify(body || {})
  return /(^|[^_a-z])number/i.test(txt) && /(blank|required|missing|empty|can.t be|must be|obligatoire|vide)/i.test(txt)
}

/** Qonto a refusé l'unité d'une ligne (liste d'unités imposée). */
export function isUnitRejected(status, body) {
  if (status !== 422) return false
  const txt = typeof body === 'string' ? body : JSON.stringify(body || {})
  return /unit(?!_price)/i.test(txt)
}

/** Message lisible à partir d'une réponse d'erreur Qonto. */
export function qontoErrorDetail(body) {
  const errs = body?.errors
  if (Array.isArray(errs) && errs.length) {
    return errs.map(e => [e.source?.pointer?.replace(/^\/(data\/attributes\/)?/, ''), e.detail || e.message || e.code]
      .filter(Boolean).join(' : ')).join(' · ').slice(0, 300)
  }
  return String(body?.message || body?.error || '').slice(0, 300)
}

/** Écart entre le total TTC calculé par Qonto et celui de l'application. */
export function totalsMismatch(quote = {}, devis = {}) {
  const qontoTtc = Number(quote?.total_amount?.value)
  if (!Number.isFinite(qontoTtc)) return null
  const appTtc = computeDevisTotals(normalizeLignes(devis.lignes), devis).ttc
  return Math.abs(qontoTtc - appTtc) > 0.05 ? { qonto: qontoTtc, app: appTtc } : null
}

/**
 * Empreinte du contenu envoyé à Qonto (hors client) : permet de savoir si
 * le devis a été modifié depuis son dernier enregistrement dans Qonto,
 * sans tenir compte des changements de statut.
 */
export function qontoFingerprint(devis = {}) {
  const txt = JSON.stringify(toQontoQuote(devis, { clientId: null }))
  let h = 5381
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ─── Import : devis Qonto → devis du CRM ───

const numQ = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
// Qonto renvoie la TVA en fraction ("0.2") ou en pourcentage ("20.0")
const vatPct = (v) => { const n = numQ(v); return Math.round((n > 0 && n <= 1 ? n * 100 : n) * 10) / 10 }
const STATUT_QONTO = { approved: 'Accepté', canceled: 'Refusé' }

/**
 * Devis du CRM (sans opportunite_id) construit depuis un devis Qonto :
 * lignes, remise, conditions, statut (accepté / annulé / envoyé).
 */
export function qontoQuoteToDevis(q = {}) {
  const lignes = (q.items || []).map(it => {
    const title = String(it?.title || '').trim()
    const desc = String(it?.description || '').trim()
    return {
      type: 'ligne',
      designation: (desc && desc !== title ? `${title} — ${desc}` : title) || 'Prestation',
      unite: String(it?.unit || '').trim() || 'u',
      quantite: numQ(it?.quantity) || 1,
      prix_unitaire: numQ(it?.unit_price?.value ?? (it?.unit_price_cents != null ? it.unit_price_cents / 100 : 0)),
      tva_taux: vatPct(it?.vat_rate),
    }
  })
  const htBrut = computeDevisTotals(lignes, {}).htBrut
  const d = q.discount
  let remise = 0
  if (d && numQ(d.value) > 0) {
    remise = d.type === 'percentage'
      ? vatPct(d.value)
      : htBrut > 0 ? Math.round((numQ(d.amount?.value ?? d.value) / htBrut) * 10000) / 100 : 0
  }
  const statut = STATUT_QONTO[q.status] || 'Envoyé'
  const base = {
    numero: String(q.number || '').trim(),
    statut,
    objet: String(q.header || '').trim().slice(0, 300) || (lignes[0]?.designation || '').slice(0, 300),
    date_emission: q.issue_date || null,
    date_validite: q.expiry_date || null,
    lignes,
    remise_pct: Math.min(100, Math.max(0, remise)),
    acompte_pct: 0,
    conditions: String(q.terms_and_conditions || '').trim() || null,
    notes: String(q.footer || '').trim() || null,
    date_envoi: statut === 'Envoyé' || statut === 'Accepté' ? (q.issue_date || null) : null,
    date_reponse: q.approved_at ? String(q.approved_at).slice(0, 10) : q.canceled_at ? String(q.canceled_at).slice(0, 10) : null,
  }
  const totals = computeDevisTotals(lignes, base)
  return { ...base, total_ht: totals.ht, total_tva: totals.tva, total_ttc: totals.ttc }
}

