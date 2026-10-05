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
//   RIB : sans date de validité ; IBAN contrôlé (clé) et comparé à celui de
//         la fiche (un RIB qui change est le signal classique d'une fraude)
// Une date de fin écrite sur le document, plus proche, est prise en compte.

import { validateIban } from './validators'

export const DOC_KINDS = ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib']

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
  rib: {
    label: 'RIB', long: 'RIB (relevé d’identité bancaire)', mois: null, alerteJours: 0, sansExpiration: true,
    aide: 'RIB au nom de l’entreprise (IBAN et BIC).',
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

export const normIban = (v) => String(v || '').replace(/\s/g, '').toUpperCase()
const ibanEnd = (v) => `…${normIban(v).slice(-4)}`

/** Incohérences entre le document et la fiche de l'entreprise. */
export function identityAnomalies(doc = {}, contact = {}) {
  const out = []
  if (doc.iban) {
    if (!validateIban(doc.iban).valid) out.push('IBAN invalide (clé de contrôle fausse) : vérifiez le RIB.')
    else if (contact.iban && normIban(contact.iban) !== normIban(doc.iban)) {
      out.push(`IBAN différent de celui de la fiche (${ibanEnd(doc.iban)} au lieu de ${ibanEnd(contact.iban)}) : confirmez par téléphone avec l’entreprise avant tout paiement (risque de faux RIB).`)
    }
  }
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
  if (DOC_META[doc.kind]?.sansExpiration) {
    return { status: (doc.anomalies || []).length ? 'a_verifier' : 'ok', jours: null, valideAu: null }
  }
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
  for (const p of by('expire')) parts.push(`${label(p)} expiré${p.kind === 'kbis' || p.kind === 'rib' ? '' : 'e'} depuis ${jours(-p.jours)}`)
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
export function conformiteItems({ contacts = [], docs = [], activeIds = new Set(), today, legalChecks = [] } = {}) {
  const map = complianceByContact(docs, today)
  const out = []
  // Entreprise fermée, en liquidation ou en procédure collective (contrôle légal)
  const legal = new Map(legalChecks.map(l => [l.contact_id, l]))
  for (const c of contacts) {
    const l = legal.get(c.id)
    if (!activeIds.has(c.id) || !l || !['alerte', 'critique'].includes(l.statut)) continue
    out.push({
      id: `legal:${c.id}`, kind: 'conformite',
      title: `Entreprise — ${c.nom}`, sub: c.specialite || c.societe || '',
      reason: l.libelle || 'Procédure collective', score: l.statut === 'critique' ? 95 : 70, date: today,
      tab: 'contacts', focus: `docs:${c.id}`,
    })
  }
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

// Points que seule l'équipe peut traiter : rien à redemander à l'entreprise
// (un IBAN qui change se vérifie par téléphone, jamais par mail)
const STAFF_ONLY = [/^IBAN différent/, /^Lecture automatique impossible/]
const sansPoint = (s) => String(s).replace(/\.\s*$/, '')

/** Erreurs du document que l'entreprise peut corriger en le renvoyant. */
export const companyAnomalies = (doc) => (doc?.anomalies || []).filter(a => !STAFF_ONLY.some(re => re.test(a)))

/**
 * Documents à demander à l'entreprise : manquants, expirés, qui expirent
 * bientôt, ou erronés (à renvoyer). Un document « à vérifier » par l'équipe
 * seulement (dates à saisir, IBAN à confirmer) n'est pas redemandé.
 */
export function kindsToRequest(compliance) {
  return compliance.problems
    .filter(p => p.status !== 'a_verifier' || companyAnomalies(compliance.kinds[p.kind]?.doc).length > 0)
    .map(p => p.kind)
}

export const RELANCE_JOURS = 7

/**
 * Relance automatique (cron, entreprises sur un chantier en cours) : chaque
 * semaine tant qu'un document manque, est erroné ou expire (bientôt).
 */
export function needsAutoRelance({ compliance, lastRequest = null, now = new Date() } = {}) {
  if (!compliance || kindsToRequest(compliance).length === 0) return false
  if (!lastRequest) return true
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
        : s.status === 'a_verifier' ? ` (à renvoyer : ${sansPoint(companyAnomalies(s.doc)[0] || 'document illisible ou incomplet')})` : ''
    return `- ${DOC_META[k].aide}${etat}`
  })
  const nom = contact.societe || contact.nom || ''
  const subject = `${relance ? 'Rappel : documents' : 'Documents'} administratifs à fournir${company.nom ? ` — ${company.nom}` : ''}`
  const validite = expireLe ? `Ce lien est valable jusqu’au ${fmtD(String(expireLe).slice(0, 10))}.` : ''
  const clean = (arr) => arr.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
  const intro = [
    'Bonjour,',
    '',
    `Dans le cadre de nos chantiers, nous devons disposer des documents administratifs à jour${nom ? ` de ${nom}` : ''} (obligation de vigilance du donneur d’ordre) :`,
    '',
    ...lignes,
    '',
  ]
  const fin = ['', 'Merci par avance,', company.nom || '']
  const text = clean([...intro, 'Vous pouvez les déposer directement, sans créer de compte, sur cette page (PDF ou photo) :', link, validite, ...fin])
  // Version HTML : le lien devient un bouton (pas d'adresse longue dans le texte)
  const htmlBody = clean([...intro, 'Déposez-les directement avec le bouton ci-dessous, sans créer de compte (PDF ou photo).', validite, ...fin])
  return { subject, text, htmlBody, action: { url: link, label: 'Déposer mes documents', hint: 'Dépôt sécurisé, sans création de compte.' } }
}

// ─── Planification des relances et suivi (écran « Suivi des documents ») ───

/** Nombre maximal de mails de relance par passage (un passage par jour ouvré). */
export const MAX_RELANCES_PAR_PASSAGE = 15

/** Clé settings : toutes les relances automatiques suspendues ('on'). */
export const PAUSE_KEY = 'conformite_relances_pause'

/**
 * Relances suspendues pour cette entreprise ? null si non, sinon
 * { jusquau } (null = sans limite). Reprise automatique à la date indiquée.
 */
export function relancePause(contact, today) {
  if (!contact?.relances_suspendues) return null
  const fin = contact.relances_reprise_le
  if (isIsoDate(fin) && fin <= today) return null
  return { jusquau: isIsoDate(fin) ? fin : null }
}

const lastSent = (r) => (r ? String(r.dernier_envoi || r.created_at || '') : '')

/** Lundi suivant si la date tombe un samedi ou un dimanche (AAAA-MM-JJ). */
export function nextWeekday(iso) {
  const d = new Date(`${iso}T12:00:00Z`)
  const wd = d.getUTCDay()
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (wd === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Relances dues maintenant, dans l'ordre d'envoi : d'abord les entreprises
 * jamais sollicitées, puis la demande la plus ancienne ; à nom égal, ordre
 * alphabétique. Le cron envoie les MAX_RELANCES_PAR_PASSAGE premières.
 */
/**
 * Entreprise suivie (documents et relances) : artisan, sous-traitant ou
 * prestataire sur un chantier en cours, ou toute fiche à laquelle une
 * demande de documents a été envoyée (même sans chantier en cours).
 * @returns {'chantier'|'demande'|null}
 */
export function trackedReason(c, activeIds = new Set(), lastRequest = new Map()) {
  if (!c || c.actif === false) return null
  if (isSubject(c) && activeIds.has(c.id)) return 'chantier'
  if (lastRequest.has(c.id)) return 'demande'
  return null
}

export function planRelances({ contacts = [], byContact, lastRequest = new Map(), activeIds = new Set(), today, now = new Date(), globalPause = false } = {}) {
  if (globalPause) return []
  return contacts
    .filter(c => trackedReason(c, activeIds, lastRequest) && c.email && !relancePause(c, today))
    .map(c => ({ contact: c, compliance: complianceOf(byContact, c.id, today), lastRequest: lastRequest.get(c.id) || null }))
    .filter(x => needsAutoRelance({ compliance: x.compliance, lastRequest: x.lastRequest, now }))
    .sort((a, b) => lastSent(a.lastRequest).localeCompare(lastSent(b.lastRequest))
      || String(a.contact.nom || '').localeCompare(String(b.contact.nom || ''), 'fr'))
    .map((x, i) => ({ ...x, kinds: kindsToRequest(x.compliance), passage: Math.floor(i / MAX_RELANCES_PAR_PASSAGE) }))
}

/**
 * Suivi de l'avancement : une ligne par entreprise soumise (artisan,
 * sous-traitant, prestataire), état de chaque document, dernière demande,
 * prochaine relance ; statistiques sur les entreprises actives.
 */
export function buildSuivi({ contacts = [], byContact, lastRequest = new Map(), activeIds = new Set(), today, now = new Date(), globalPause = false } = {}) {
  const plan = planRelances({ contacts, byContact, lastRequest, activeIds, today, now, globalPause })
  const planned = new Map(plan.map(p => [p.contact.id, p]))
  const rows = contacts.filter(c => isSubject(c) || lastRequest.has(c.id)).map(c => {
    const compliance = complianceOf(byContact, c.id, today)
    const req = lastRequest.get(c.id) || null
    // « active » = suivie : chantier en cours ou demande envoyée
    const origine = trackedReason(c, activeIds, lastRequest)
    const active = !!origine
    const toRequest = kindsToRequest(compliance)
    let relance
    if (!active) relance = { kind: 'inactive' }
    else if (compliance.status === 'ok') relance = { kind: 'a_jour' }
    else if (!toRequest.length) relance = { kind: 'equipe' }
    else if (!c.email) relance = { kind: 'sans_email' }
    else if (relancePause(c, today)) relance = { kind: 'suspendue', jusquau: relancePause(c, today).jusquau }
    else if (globalPause) relance = { kind: 'pause_globale' }
    else if (planned.has(c.id)) relance = { kind: 'prevue', passage: planned.get(c.id).passage }
    else relance = { kind: 'date', date: nextWeekday(addDays(lastSent(req).slice(0, 10) || today, RELANCE_JOURS)) }
    const recus = DOC_KINDS.filter(k => ['ok', 'bientot'].includes(compliance.kinds[k].status)).length
    return { contact: c, active, origine, compliance, lastRequest: req, relance, recus, pause: relancePause(c, today) }
  }).sort((a, b) => (b.active - a.active) || (a.recus - b.recus) || String(a.contact.nom).localeCompare(String(b.contact.nom), 'fr'))
  const act = rows.filter(r => r.active)
  return {
    rows,
    plan,
    stats: {
      actives: act.length,
      aJour: act.filter(r => r.compliance.status === 'ok').length,
      docsRecus: act.reduce((n, r) => n + r.recus, 0),
      docsTotal: act.length * DOC_KINDS.length,
      sansEmail: act.filter(r => r.relance.kind === 'sans_email').length,
      prochainPassage: plan.filter(p => p.passage === 0).length,
      enAttente: plan.length,
    },
  }
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Code en tête de l'objet des mails de dépôt : sert de filtre Gmail (subject:IDMDOC). */
export const DEPOSIT_MAIL_TAG = '[IDMDOC]'

/**
 * Mail à l'équipe à chaque dépôt d'une entreprise : document reçu, ce qui a
 * été lu, avancement de l'entreprise (documents à jour / encore à fournir).
 * @returns {{ subject, text, htmlBody, action }}
 */
export function depositMailText({ contact = {}, kind, doc = {}, compliance, appUrl = '' } = {}) {
  const nom = contact.societe || contact.nom || 'Une entreprise'
  const meta = DOC_META[kind] || { long: kind }
  const k = compliance?.kinds?.[kind] || docStatus(doc, '')
  const lu = DOC_META[kind]?.sansExpiration
    ? [doc.iban ? `IBAN lu : ${doc.iban.replace(/(.{4})/g, '$1 ').trim()}` : 'IBAN non lu', doc.raison_sociale ? `titulaire : ${doc.raison_sociale}` : null].filter(Boolean).join(' · ')
    : (k?.valideAu ? `valable jusqu’au ${fmtD(k.valideAu)}` : 'date de validité non lue : à saisir dans la fiche')
  const total = DOC_KINDS.length
  const aJour = compliance ? DOC_KINDS.filter(x => ['ok', 'bientot'].includes(compliance.kinds[x].status)).length : null
  const reste = compliance ? kindsToRequest(compliance).map(x => DOC_META[x].label) : []
  const anomalies = doc.anomalies || []
  const lines = [
    `${nom} vient de déposer : ${meta.long}${doc.file_name ? ` (${doc.file_name})` : ''}.`,
    '',
    `Lecture automatique : ${lu}.`,
    ...anomalies.map(a => `À vérifier : ${a}`),
    '',
    aJour === null ? null : (aJour === total
      ? `Avancement : ${total}/${total} documents à jour. Dossier complet.`
      : `Avancement : ${aJour}/${total} documents à jour${reste.length ? ` · encore à fournir ou à revoir : ${reste.join(', ')}` : ''}.`),
  ].filter(l => l !== null)
  const subject = `${DEPOSIT_MAIL_TAG} 📄 ${nom} a déposé : ${meta.long}${anomalies.length ? ' (à vérifier)' : ''}`
  const text = [...lines, appUrl ? `\nOuvrir l’application : ${appUrl} (Contacts → Documents)` : ''].join('\n').trim()
  return {
    subject, text, htmlBody: lines.join('\n'),
    action: appUrl ? { url: appUrl, label: 'Ouvrir l’application', hint: 'Contacts → Documents de l’entreprise' } : null,
  }
}
