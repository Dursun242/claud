// Aperçu affiché sur les cartes du pipeline CRM : où en est le mail du devis
// (ouvert, consulté, relancé, réponse du client) et le prochain rappel.
// Logique pure, testée dans __tests__/oppPreview.test.js.

import { summarizeDevisEvents } from './devisTracking'
import { raisonOf } from './devisRelance'

const DAY = 86_400_000
const day = (v) => (v ? String(v).slice(0, 10) : '')
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysFrom = (iso, td) => Math.round((toUTC(td) - toUTC(iso)) / DAY)
const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** « aujourd'hui », « hier », « il y a 3 j », « demain », « le 15 oct. » */
export function relDay(iso, td) {
  const d = day(iso)
  if (!d) return ''
  const n = daysFrom(d, td)
  if (n === 0) return "aujourd'hui"
  if (n === 1) return 'hier'
  if (n === -1) return 'demain'
  if (n > 1 && n <= 30) return `il y a ${n} j`
  return `le ${shortDate(d)}`
}

/**
 * @param {object} p
 * @param {Array}  p.devis         crm_devis
 * @param {Array}  p.devisEvents   crm_devis_events
 * @param {Array}  p.interactions  crm_interactions
 * @param {Set}    [p.pendingIds]  ids des relances encore à faire (classifyFollowUps,
 *                                 relances devenues sans objet exclues)
 * @param {string} p.today         AAAA-MM-JJ
 * @returns {Map<string, { mail: { text, tone } | null, rappel: { text, tone } | null }>}
 *   tone : 'chaud' (le client y pense), 'retard', 'aujourdhui', 'attente', 'neutre'
 */
export function buildOppPreviews({ devis = [], devisEvents = [], interactions = [], pendingIds = null, today }) {
  const td = day(today)
  const suivi = summarizeDevisEvents(devisEvents)
  const out = new Map()
  const entry = (id) => out.get(id) || (out.set(id, { mail: null, rappel: null }), out.get(id))

  // Dernier devis envoyé (ou répondu) de chaque affaire
  const latest = new Map()
  for (const d of devis) {
    if (!d?.opportunite_id || !d.date_envoi) continue
    const prev = latest.get(d.opportunite_id)
    if (!prev || day(d.date_envoi) > day(prev.date_envoi)) latest.set(d.opportunite_id, d)
  }
  for (const [oppId, d] of latest) {
    const s = suivi[d.id]
    const parts = []
    let tone = 'neutre'
    const reponse = s?.reponses?.[0]
    if (d.statut === 'Accepté' || d.statut_signature === 'Signé') {
      parts.push(`Devis ${d.numero} signé`)
      tone = 'chaud'
    } else if (d.statut === 'Refusé') {
      parts.push(`Devis ${d.numero} refusé`)
    } else if (reponse) {
      const r = raisonOf(reponse.raison)
      parts.push(`Réponse ${relDay(reponse.created_at, td)} : ${r?.court || reponse.raison}`)
      tone = r?.ton === 'chaud' ? 'chaud' : 'attente'
    } else if (s?.consultations && s.derniereConsultation) {
      parts.push(`Devis consulté en ligne ${relDay(s.derniereConsultation, td)}`)
      tone = 'chaud'
    } else if (s?.relanceOuvertures && s.derniereRelanceOuverture) {
      parts.push(`Relance ouverte ${relDay(s.derniereRelanceOuverture, td)}`)
      tone = 'chaud'
    } else if (s?.ouvertures && s.derniereOuverture) {
      parts.push(`Mail ouvert ${s.ouvertures > 1 ? `${s.ouvertures} fois, ` : ''}${s.ouvertures > 1 ? 'dernière ' : ''}${relDay(s.derniereOuverture, td)}`)
      tone = 'chaud'
    } else {
      parts.push(`Devis ${d.numero} envoyé ${relDay(d.date_envoi, td)}, pas encore ouvert`)
    }
    if (s?.relances && !reponse && d.statut === 'Envoyé') {
      parts.push(`relancé ${s.relances > 1 ? `${s.relances} fois` : relDay(s.derniereRelance, td)}`)
    }
    entry(oppId).mail = { text: parts.join(' · '), tone }
  }

  // Prochain rappel à faire (le plus proche)
  const next = new Map()
  for (const it of interactions) {
    if (!it?.opportunite_id || it.action_faite || !it.prochaine_action_date) continue
    if (pendingIds && !pendingIds.has(it.id)) continue
    const prev = next.get(it.opportunite_id)
    if (!prev || day(it.prochaine_action_date) < day(prev.prochaine_action_date)) next.set(it.opportunite_id, it)
  }
  for (const [oppId, it] of next) {
    const d = day(it.prochaine_action_date)
    const n = daysFrom(d, td)
    const tone = n > 0 ? 'retard' : n === 0 ? 'aujourdhui' : 'attente'
    const quand = n > 0 ? `en retard de ${n} j` : relDay(d, td)
    entry(oppId).rappel = { text: `${it.prochaine_action || 'Rappel'} · ${quand}`, tone }
  }
  return out
}
