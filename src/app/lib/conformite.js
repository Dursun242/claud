// Documents administratifs des entreprises (obligation de vigilance du
// maître d'œuvre) : Kbis, décennale, attestation fiscale, attestation
// URSSAF. Logique pure (ni React ni Supabase), partagée par l'écran
// Contacts, les intervenants d'un chantier, les priorités du jour, le mail du
// matin et les routes /api/conformite. Tests : __tests__/conformite.test.js.
//
// Règles de validité retenues :
//   Kbis (ou extrait D1 / avis de situation INSEE) : moins de 3 mois
//   Attestation URSSAF (vigilance) : 6 mois à partir de sa date
//   Attestation fiscale : 6 mois à partir de sa date
//   Décennale : fin de la période de validité écrite sur l'attestation
// Une date de fin écrite sur le document, plus proche, est prise en compte.

export const DOC_KINDS = ['kbis', 'decennale', 'urssaf', 'fiscale']

export const DOC_META = {
  kbis: {
    label: 'Kbis', long: 'Extrait Kbis', mois: 3, alerteJours: 15,
    aide: 'Extrait Kbis de moins de 3 mois (artisan : extrait D1 ou avis de situation INSEE).',
  },
  decennale: {
    label: 'Décennale', long: 'Attestation d’assurance décennale', mois: null, alerteJours: 30,
    aide: 'Attestation d’assurance décennale en cours de validité, avec les activités couvertes.',
  },
  urssaf: {
    label: 'URSSAF', long: 'Attestation de vigilance URSSAF', mois: 6, alerteJours: 15,
    aide: 'Attestation de vigilance URSSAF de moins de 6 mois.',
  },
  fiscale: {
    label: 'Fiscale', long: 'Attestation de régularité fiscale', mois: 6, alerteJours: 15,
    aide: 'Attestation de régularité fiscale de moins de 6 mois (espace professionnel impots.gouv.fr).',
  },
}

export const STATUS_META = {
  ok: { label: 'À jour', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0', rank: 0 },
  bientot: { label: 'Expire bientôt', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', rank: 1 },
  a_verifier: { label: 'À vérifier', color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA', rank: 2 },
  manquant: { label: 'Manquant', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', rank: 3 },
  expire: { label: 'Expiré', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', rank: 4 },
}

/** Types de contacts soumis à l'obligation de vigilance. */
export const SUBJECT_TYPES = ['Artisan', 'Sous-traitant', 'Prestataire']
export const isSubject = (c) => !!c && SUBJECT_TYPES.includes(c.type) && c.actif !== false

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDate = (v) => ISO.test(String(v || ''))
const DAY = 86_400_000
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
export const daysBetween = (from, to) => Math.round((toUTC(to) - toUTC(from)) / DAY)

/** AAAA-MM-JJ + n mois (le 31 → dernier jour du mois si besoin). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

/** Fin de validité retenue pour un document. */
export function computeValidUntil(kind, { date_document, valide_au } = {}) {
  const meta = DOC_META[kind]
  const ecrite = isIsoDate(valide_au) ? valide_au : null
  if (!meta) return ecrite
  if (meta.mois && isIsoDate(date_document)) {
    const regle = addMonths(date_document, meta.mois)
    return ecrite && ecrite < regle ? ecrite : regle
  }
  return ecrite
}

const sirenOf = (v) => String(v || '').replace(/\D/g, '').slice(0, 9)

/** Incohérences entre le document et la fiche de l'entreprise. */
export function identityAnomalies(doc = {}, contact = {}) {
  const out = []
  const lu = sirenOf(doc.siret_lu)
  const fiche = sirenOf(contact.siret)
  if (lu.length === 9 && fiche.length === 9 && lu !== fiche) {
    out.push(`SIREN du document (${lu}) différent de celui de la fiche (${fiche}).`)
  }
  return out
}

/** État d'un document à une date donnée. */
export function docStatus(doc, today) {
  if (!doc) return { status: 'manquant', jours: null, valideAu: null }
  const valideAu = doc.valide_au || computeValidUntil(doc.kind, doc)
  if (!isIsoDate(valideAu)) return { status: 'a_verifier', jours: null, valideAu: null }
  const jours = daysBetween(today, valideAu)
  if (jours < 0) return { status: 'expire', jours, valideAu }
  if ((doc.anomalies || []).length) return { status: 'a_verifier', jours, valideAu }
  const alerte = DOC_META[doc.kind]?.alerteJours ?? 15
  return { status: jours <= alerte ? 'bientot' : 'ok', jours, valideAu }
}

/** Dernier document déposé de chaque type. */
export function latestByKind(docs = []) {
  const out = {}
  for (const d of docs) {
    if (!DOC_KINDS.includes(d.kind)) continue
    const cur = out[d.kind]
    if (!cur || String(d.created_at || '') > String(cur.created_at || '')) out[d.kind] = d
  }
  return out
}

/**
 * Situation d'une entreprise : état de chaque document et état global (le
 * plus grave).
 * @returns {{ status, kinds: Record<string, {status, jours, valideAu, doc}>, problems: Array<{kind, status, jours}> }}
 */
export function contactCompliance(docs = [], today) {
  const latest = latestByKind(docs)
  const kinds = {}
  const problems = []
  let worst = 'ok'
  for (const kind of DOC_KINDS) {
    const doc = latest[kind] || null
    const s = docStatus(doc, today)
    kinds[kind] = { ...s, doc }
    if (s.status !== 'ok') problems.push({ kind, status: s.status, jours: s.jours })
    if (STATUS_META[s.status].rank > STATUS_META[worst].rank) worst = s.status
  }
  return { status: worst, kinds, problems }
}

/** Documents regroupés par contact → situation de chaque contact. */
export function complianceByContact(docs = [], today) {
  const groups = new Map()
  for (const d of docs) {
    if (!groups.has(d.contact_id)) groups.set(d.contact_id, [])
    groups.get(d.contact_id).push(d)
  }
  const out = new Map()
  for (const [id, list] of groups) out.set(id, contactCompliance(list, today))
  return out
}

const EMPTY = (today) => contactCompliance([], today)
export const complianceOf = (map, contactId, today) => map?.get(contactId) || EMPTY(today)

const CLOSED_CHANTIER = ['Terminé', 'Annulé']

/**
 * Entreprises qui travaillent sur un chantier en cours (OS non annulé ou
 * rattachement manuel aux intervenants).
 */
export function activeCompanyIds({ chantiers = [], ordresService = [], contacts = [], contactChantiers = [] } = {}) {
  const open = new Set(chantiers.filter(c => !CLOSED_CHANTIER.includes(c.statut)).map(c => c.id))
  const byName = new Map()
  for (const c of contacts) if (c?.nom) byName.set(String(c.nom).trim().toLowerCase(), c.id)
  const ids = new Set()
  for (const o of ordresService) {
    if (!open.has(o.chantier_id) || o.statut === 'Annulé') continue
    const id = byName.get(String(o.artisan_nom || '').trim().toLowerCase())
    if (id) ids.add(id)
  }
  for (const l of contactChantiers) if (open.has(l.chantier_id) && l.contact_id) ids.add(l.contact_id)
  return ids
}

const jours = (n) => (n === 1 ? '1 jour' : `${n} jours`)
const listFr = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} et ${arr[arr.length - 1]}`)

/** Phrase courte : « Décennale expirée depuis 3 jours », « À fournir : Kbis et URSSAF »… */
export function problemSummary(compliance) {
  const by = (st) => compliance.problems.filter(p => p.status === st)
  const label = (p) => DOC_META[p.kind].label
  const parts = []
  for (const p of by('expire')) parts.push(`${label(p)} expiré${p.kind === 'kbis' ? '' : 'e'} depuis ${jours(-p.jours)}`)
  const missing = by('manquant').map(label)
  if (missing.length) parts.push(`À fournir : ${listFr(missing)}`)
  const check = by('a_verifier').map(label)
  if (check.length) parts.push(`À vérifier : ${listFr(check)}`)
  for (const p of by('bientot')) parts.push(`${label(p)} expire ${p.jours === 0 ? "aujourd'hui" : `dans ${jours(p.jours)}`}`)
  return parts.join(' · ')
}

/**
 * Éléments « priorités du jour » : entreprises actives sur un chantier dont
 * un document est expiré, manquant, à vérifier ou expire bientôt.
 *   expiré 58 + jours de retard (max 10) · manquant 42 · à vérifier 35 ·
 *   expire bientôt 28 + (15 − jours restants)
 */
export function conformiteItems({ contacts = [], docs = [], activeIds = new Set(), today } = {}) {
  const map = complianceByContact(docs, today)
  const out = []
  for (const c of contacts) {
    if (!activeIds.has(c.id) || !isSubject(c)) continue
    const comp = complianceOf(map, c.id, today)
    if (comp.status === 'ok') continue
    const expired = comp.problems.filter(p => p.status === 'expire')
    const soon = comp.problems.filter(p => p.status === 'bientot')
    let score
    if (expired.length) score = 58 + Math.min(10, Math.max(...expired.map(p => -p.jours)))
    else if (comp.status === 'manquant') score = 42
    else if (comp.status === 'a_verifier') score = 35
    else score = 28 + Math.max(0, 15 - Math.min(15, Math.min(...soon.map(p => p.jours))))
    out.push({
      id: `conformite:${c.id}`, kind: 'conformite',
      title: `Documents — ${c.nom}`, sub: c.specialite || c.societe || '',
      reason: problemSummary(comp), score, date: today,
      tab: 'contacts', focus: `docs:${c.id}`,
    })
  }
  return out
}

/** Documents à demander à l'entreprise (tout sauf ce qui est à jour). */
export const kindsToRequest = (compliance) => compliance.problems.map(p => p.kind)

const RELANCE_JOURS = 7
const MAX_ENVOIS_AUTO = 4

/**
 * Relance automatique (cron) d'une entreprise active : seulement pour
 * renouveler un document déjà fourni (expiré ou qui expire bientôt), ou si
 * une demande a déjà été envoyée et que des documents manquent encore. Une
 * première demande n'est jamais envoyée automatiquement.
 */
export function needsAutoRelance({ compliance, lastRequest = null, now = new Date() } = {}) {
  if (!compliance || compliance.status === 'ok') return false
  const renew = compliance.problems.some(p => p.status === 'expire' || p.status === 'bientot')
  const stillMissing = !!lastRequest && compliance.problems.some(p => p.status === 'manquant')
  if (!renew && !stillMissing) return false
  if (!lastRequest) return true
  if ((lastRequest.envois || 0) >= MAX_ENVOIS_AUTO && lastRequest.auto) return false
  const last = new Date(lastRequest.dernier_envoi || lastRequest.created_at || 0).getTime()
  return now.getTime() - last >= RELANCE_JOURS * DAY
}

const fmtD = (iso) => (isIsoDate(iso) ? iso.split('-').reverse().join('/') : '')

/** Texte du mail de demande de documents envoyé à l'entreprise. */
export function requestMailText({ contact = {}, compliance, link, expireLe, company = {}, relance = false } = {}) {
  const kinds = kindsToRequest(compliance)
  const lignes = (kinds.length ? kinds : DOC_KINDS).map(k => {
    const s = compliance.kinds[k]
    const etat = s.status === 'expire' ? ` (expiré le ${fmtD(s.valideAu)})`
      : s.status === 'bientot' ? ` (expire le ${fmtD(s.valideAu)})`
        : s.status === 'a_verifier' ? ' (à renvoyer, document illisible ou incomplet)' : ''
    return `- ${DOC_META[k].aide}${etat}`
  })
  const nom = contact.societe || contact.nom || ''
  const subject = `${relance ? 'Rappel : ' : ''}documents administratifs à fournir${company.nom ? ` — ${company.nom}` : ''}`
  const text = [
    'Bonjour,',
    '',
    `Dans le cadre de nos chantiers${nom ? ` avec ${nom}` : ''}, nous devons disposer de vos documents administratifs à jour (obligation de vigilance) :`,
    '',
    ...lignes,
    '',
    'Vous pouvez les déposer directement, sans créer de compte, sur cette page (PDF ou photo) :',
    link,
    expireLe ? `Ce lien est valable jusqu’au ${fmtD(String(expireLe).slice(0, 10))}.` : '',
    '',
    'Merci par avance,',
    company.nom || '',
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
  return { subject, text }
}
