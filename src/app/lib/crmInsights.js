// Bloc « Commercial » du tableau de bord : chiffres clés du CRM et signaux
// à traiter, triés par intérêt. Logique pure, testée dans
// __tests__/crmInsights.test.js.
//
// Signaux :
//  - 🔥 devis consulté ou ouvert récemment, sans réponse : le client y
//    pense, c'est le moment d'appeler ;
//  - ✍️ signature en ligne demandée, pas encore signée ;
//  - ⏳ devis bientôt expiré (date de validité dans les 7 jours) ;
//  - 📭 devis envoyé sans réponse depuis plus de 15 jours ;
//  - 📝 devis brouillon jamais envoyé depuis plus de 3 jours ;
//  - 💤 affaire active sans échange depuis plus de 21 jours.
// Un devis n'apparaît qu'une fois (son signal le plus fort).

import { isClosed, daysSinceLastInteraction, pipelineStats } from './crm'

const DAY = 86_400_000
const day = (v) => (v ? String(v).slice(0, 10) : '')
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (from, to) => (from && to ? Math.round((toUTC(to) - toUTC(from)) / DAY) : null)
const num = (v) => Number(v) || 0
const isoToday = (t) => (t instanceof Date ? t : new Date(t)).toISOString().slice(0, 10)

export const HOT_DAYS = 7
export const NO_ANSWER_DAYS = 15
export const DRAFT_DAYS = 3
export const DORMANT_DAYS = 21
export const EXPIRY_DAYS = 7

const ORDER = { chaud: 0, signature: 1, expire: 2, sans_reponse: 3, brouillon: 4, dormante: 5 }

/**
 * @param {object} crm  { opportunites, interactions, devis, devisEvents }
 * @param {object} [opts] { today: Date|string, contactsById: Map }
 * @returns {{ kpis: object, items: object[] }}
 */
export function buildCrmInsights(crm = {}, { today = new Date(), contactsById = new Map() } = {}) {
  const td = typeof today === 'string' ? day(today) : isoToday(today)
  const opps = crm.opportunites || []
  const devis = crm.devis || []
  const events = crm.devisEvents || []
  const interactions = crm.interactions || []
  const oppById = new Map(opps.map(o => [o.id, o]))
  const who = (o) => {
    const c = o && contactsById.get(o.contact_id)
    return [o?.titre, c?.nom].filter(Boolean).join(' · ')
  }

  // ─── Chiffres clés ───
  const stats = pipelineStats(opps, new Date(`${td}T12:00:00Z`))
  const enAttente = devis.filter(d => d.statut === 'Envoyé')
  const acceptes30 = devis.filter(d => {
    const n = d.statut === 'Accepté' && d.date_reponse ? daysBetween(day(d.date_reponse), td) : null
    return n != null && n >= 0 && n <= 30
  })
  const repondus = devis.filter(d => (d.statut === 'Accepté' || d.statut === 'Refusé') && daysBetween(day(d.date_reponse), td) <= 180)
  const kpis = {
    affairesActives: stats.actives,
    pipelineHT: stats.montantPipeline,
    pondereHT: stats.montantPondere,
    devisEnAttente: enAttente.length,
    devisEnAttenteHT: enAttente.reduce((s, d) => s + num(d.total_ht), 0),
    signes30j: acceptes30.length,
    signes30jHT: acceptes30.reduce((s, d) => s + num(d.total_ht), 0),
    tauxSignature: repondus.length >= 3
      ? Math.round(100 * repondus.filter(d => d.statut === 'Accepté').length / repondus.length) : null,
  }

  // ─── Signaux ───
  const lastEvent = new Map()
  for (const e of events) {
    if (!e?.devis_id || !e.created_at) continue
    const prev = lastEvent.get(e.devis_id)
    if (!prev || String(e.created_at) > String(prev.created_at)) lastEvent.set(e.devis_id, e)
  }
  const items = []
  const seenDevis = new Set()
  const push = (item) => { items.push(item) }

  for (const d of devis) {
    const o = oppById.get(d.opportunite_id)
    if (o && isClosed(o.etape)) continue
    const base = { devisId: d.id, oppId: o?.id || null, numero: d.numero || '', montant: num(d.total_ht), sub: who(o) || d.objet || '' }
    if (d.statut === 'Envoyé') {
      const ev = lastEvent.get(d.id)
      const evDays = ev ? daysBetween(day(ev.created_at), td) : null
      if (ev && evDays != null && evDays <= HOT_DAYS && d.statut_signature !== 'Signé') {
        const what = ev.kind === 'ouverture' ? 'mail ouvert' : ev.kind === 'pdf' ? 'PDF téléchargé' : 'devis consulté'
        push({ ...base, kind: 'chaud', days: evDays, event: ev.kind, title: `Devis ${d.numero} : ${what} ${evDays === 0 ? "aujourd'hui" : evDays === 1 ? 'hier' : `il y a ${evDays} j`}`, hint: 'Le client y pense : appelle-le' })
        seenDevis.add(d.id); continue
      }
      if (d.statut_signature === 'Envoyé') {
        const n = daysBetween(day(d.date_envoi), td)
        push({ ...base, kind: 'signature', days: n, title: `Devis ${d.numero} : signature en attente${n != null ? ` depuis ${n} j` : ''}`, hint: 'Lien de signature envoyé, pas encore signé' })
        seenDevis.add(d.id); continue
      }
      const left = d.date_validite ? daysBetween(td, day(d.date_validite)) : null
      if (left != null && left >= 0 && left <= EXPIRY_DAYS) {
        push({ ...base, kind: 'expire', days: left, title: `Devis ${d.numero} expire ${left === 0 ? "aujourd'hui" : left === 1 ? 'demain' : `dans ${left} j`}`, hint: 'Relancer ou prolonger la validité' })
        seenDevis.add(d.id); continue
      }
      const since = daysBetween(day(d.date_envoi), td)
      if (since != null && since > NO_ANSWER_DAYS) {
        push({ ...base, kind: 'sans_reponse', days: since, title: `Devis ${d.numero} sans réponse depuis ${since} j`, hint: 'Relancer ou classer l’affaire' })
        seenDevis.add(d.id); continue
      }
    } else if (d.statut === 'Brouillon') {
      const age = daysBetween(day(d.updated_at || d.date_emission || d.created_at), td)
      if (age != null && age > DRAFT_DAYS) {
        push({ ...base, kind: 'brouillon', days: age, title: `Devis ${d.numero || ''} pas encore envoyé (${age} j)`.replace('  ', ' '), hint: 'Brouillon en attente' })
        seenDevis.add(d.id)
      }
    }
  }

  // Affaires dormantes (sauf si un de leurs devis est déjà signalé)
  const flaggedOpps = new Set(items.map(i => i.oppId).filter(Boolean))
  for (const o of opps) {
    if (isClosed(o.etape) || flaggedOpps.has(o.id)) continue
    let idle = daysSinceLastInteraction(o, interactions, new Date(`${td}T12:00:00Z`))
    if (idle == null && o.created_at) idle = daysBetween(day(o.created_at), td)
    if (idle != null && idle > DORMANT_DAYS) {
      push({ kind: 'dormante', oppId: o.id, devisId: null, days: idle, montant: num(o.montant_estime), sub: who(o), title: `${o.titre || 'Affaire'} : aucun échange depuis ${idle} j`, hint: `Étape « ${o.etape} »` })
    }
  }

  items.sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (b.montant - a.montant))
  return { kpis, items }
}
