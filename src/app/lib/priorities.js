// « Mes priorités du jour » : un classement unique, chantier + commercial,
// qui dit par quoi commencer et pourquoi. Logique pure (ni React ni
// Supabase) : utilisée par le tableau de bord (PrioritiesPanel) et
// réutilisable côté serveur (mail du matin). Tests :
// __tests__/priorities.test.js.
//
// Entrées : `agenda` = buildAgenda (lib/today.js), `crmItems` =
// buildCrmInsights(...).items (lib/crmInsights.js).
//
// Score (plus haut = plus urgent) :
//   tâche en retard          60 + jours de retard (max 30), +25 si « Urgent »
//   rendez-vous du jour      80 (daté ; écarté 1 h après son heure si `now` est fourni)
//   relance CRM en retard    55 + jours de retard (max 30)
//   devis chaud              50 + montant (1 pt / 1 000 € HT, max 20) − jours depuis l'ouverture
//   devis bientôt expiré     45 + 2 × (7 − jours restants)
//   phase en retard          45 + jours de retard (max 20)
//   signature en attente     40 + montant (1 pt / 1 000 € HT, max 15)
//   tâche du jour            40, +25 si « Urgent »
//   relance du jour          38
//   phase qui démarre / se termine aujourd'hui   30
//   OS à signer              25
//   devis sans réponse       20 + montant (1 pt / 1 000 € HT, max 10)
//   devis brouillon          15
//   affaire dormante         10
//
// Doublons : un élément n'apparaît qu'une fois ; côté CRM, une relance et un
// signal sur la même affaire (même écran ouvert) sont fusionnés, le plus
// urgent est gardé. Tri : score décroissant, puis date croissante, puis id.

import { localISO } from './today'

const DAY = 86_400_000
const day = (v) => (v ? String(v).slice(0, 10) : '')
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const daysBetween = (from, to) => (from && to ? Math.round((toUTC(to) - toUTC(from)) / DAY) : null)
const cap = (n, max) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)))
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`
const jours = (n) => (n === 1 ? '1 jour' : plural(n, 'jour'))
const isUrgent = (t) => t.priorite === 'Urgent'
const minutes = (hm) => { const [h, m] = String(hm).split(':').map(Number); return (h || 0) * 60 + (m || 0) }

// 1250 → « 1 250 € » (espaces simples, lisibles dans un mail texte)
export function fmtEuros(n) {
  const v = Math.round(Number(n) || 0)
  return `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`
}

// « 14:00 » → « 14 h », « 09:30 » → « 9 h 30 »
export function fmtHeure(hm) {
  const m = String(hm || '').match(/^(\d{1,2})[:h](\d{2})/)
  if (!m) return ''
  const h = Number(m[1]), min = m[2]
  return min === '00' ? `${h} h` : `${h} h ${min}`
}

const deJours = (n) => (n === 1 ? "d'un jour" : `de ${n} jours`)
const quand = (n) => (n === 0 ? "aujourd'hui" : n === 1 ? 'hier' : `il y a ${jours(n)}`)
const EVENT_VERB = { ouverture: 'ouvert', pdf: 'téléchargé' }

function fromAgenda(agenda, today, now) {
  const out = []
  for (const t of agenda.tasksOverdue || []) {
    const late = Math.max(1, daysBetween(t.date, today) || 1)
    const urgent = isUrgent(t)
    out.push({
      id: `task:${t.id}`, kind: 'task', title: t.title || 'Tâche', sub: t.sub || '',
      reason: `${urgent ? 'Urgente, en retard' : 'En retard'} ${deJours(late)}`,
      score: 60 + cap(late, 30) + (urgent ? 25 : 0), date: t.date, tab: t.tab || 'tasks', focus: t.focus ?? t.id,
    })
  }
  for (const r of agenda.rdvToday || []) {
    const hm = String(r.heure || '').match(/^(\d{1,2})[:h](\d{2})/)
    const heure = hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : ''
    if (now && heure && minutes(heure) + 60 < minutes(now)) continue // passé depuis plus d'1 h
    out.push({
      id: `rdv:${r.id}`, kind: 'rdv', title: r.title || 'Rendez-vous', sub: r.sub || '',
      reason: heure ? `Rendez-vous à ${fmtHeure(heure)}` : "Rendez-vous aujourd'hui",
      score: 80, date: `${today}T${heure || '00:00'}`, tab: r.tab || 'planning', focus: r.focus ?? null,
    })
  }
  for (const r of agenda.relances || []) {
    const late = r.late ? Math.max(1, daysBetween(day(r.date), today) || 1) : 0
    out.push({
      id: `relance:${r.id}`, kind: 'relance', title: r.title || 'Relance', sub: r.sub || '',
      reason: r.late ? `Relance prévue ${quand(late)}` : "Relance prévue aujourd'hui",
      score: r.late ? 55 + cap(late, 30) : 38, date: day(r.date) || today,
      tab: r.tab || 'crm', focus: r.focus ?? null,
      // Même affaire qu'un signal commercial → un seul élément
      dedupe: r.focus && r.focus !== 'relances' ? `crm:${r.focus}` : null,
    })
  }
  for (const p of agenda.phases || []) {
    if (p.late) {
      const late = Math.max(1, daysBetween(day(p.fin ?? p.date), today) || 1)
      const av = Number(p.avancement)
      out.push({
        id: `planning:${p.id}`, kind: 'planning', title: p.title || 'Phase', sub: p.sub || '',
        reason: `Fin prévue dépassée ${deJours(late)}${Number.isFinite(av) ? `, avancement ${av} %` : ''}`,
        score: 45 + cap(late, 20), date: day(p.fin ?? p.date), tab: p.tab || 'planning', focus: p.focus ?? null,
      })
    } else {
      out.push({
        id: `planning:${p.id}`, kind: 'planning', title: p.title || 'Phase', sub: p.sub || '',
        reason: p.note || 'Phase du jour',
        score: 30, date: today, tab: p.tab || 'planning', focus: p.focus ?? null,
      })
    }
  }
  for (const t of agenda.tasksToday || []) {
    const urgent = isUrgent(t)
    out.push({
      id: `task:${t.id}`, kind: 'task', title: t.title || 'Tâche', sub: t.sub || '',
      reason: urgent ? "Urgente, à faire aujourd'hui" : "À faire aujourd'hui",
      score: 40 + (urgent ? 25 : 0), date: today, tab: t.tab || 'tasks', focus: t.focus ?? t.id,
    })
  }
  for (const o of agenda.osToSign || []) {
    out.push({
      id: `os:${o.id}`, kind: 'os', title: o.title || 'OS', sub: o.sub || '',
      reason: o.statut === 'Partiellement signé' ? 'OS partiellement signé, signatures à compléter' : "OS envoyé, pas encore signé par l'artisan",
      score: 25, date: '', tab: o.tab || 'os', focus: o.focus ?? o.id,
    })
  }
  return out
}

function crmReason(it) {
  const n = it.days
  const de = it.montant > 0 ? `de ${fmtEuros(it.montant)} ` : ''
  switch (it.kind) {
    case 'chaud':
      return `Devis ${de}${EVENT_VERB[it.event] || 'consulté'} ${n == null ? 'récemment' : quand(n)}, pas encore signé`
    case 'signature':
      return `Signature du devis ${de}demandée${n == null ? '' : ` ${quand(n)}`}, pas encore signée`
    case 'expire':
      return `Devis ${de}qui expire ${n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${jours(n)}`}`
    case 'sans_reponse':
      return `Devis ${de}sans réponse depuis ${jours(n)}`
    case 'brouillon':
      return `Devis ${de}en brouillon depuis ${jours(n)}, pas encore envoyé`
    case 'dormante':
      return `Aucun échange depuis ${jours(n)}`
    default:
      return it.hint || it.title || ''
  }
}

function crmScore(it) {
  const n = Number(it.days) || 0
  switch (it.kind) {
    case 'chaud': return 50 + cap(it.montant / 1000, 20) - cap(n, 7)
    case 'expire': return 45 + 2 * (7 - cap(n, 7))
    case 'signature': return 40 + cap(it.montant / 1000, 15)
    case 'sans_reponse': return 20 + cap(it.montant / 1000, 10)
    case 'brouillon': return 15
    default: return 10
  }
}

function fromCrm(items, today) {
  return (items || []).map(it => {
    const ref = it.devisId ? `devis:${it.devisId}` : `opp:${it.oppId}`
    const title = it.devisId
      ? [`Devis ${it.numero || ''}`.trim(), it.sub].filter(Boolean).join(' · ')
      : (it.sub || it.title || 'Affaire')
    const amount = Number(it.montant) || 0
    return {
      id: `${it.kind}:${ref}`, kind: it.kind, title, sub: '',
      reason: crmReason(it), score: crmScore(it),
      date: it.days != null && it.kind !== 'expire' ? daysAgo(today, it.days) : today,
      tab: 'crm', focus: it.oppId || null,
      ...(amount > 0 ? { amount } : {}),
      dedupe: it.oppId ? `crm:${it.oppId}` : null,
    }
  })
}

function daysAgo(today, n) {
  const d = new Date(toUTC(today) - Number(n) * DAY)
  return d.toISOString().slice(0, 10)
}

const compare = (a, b) => (b.score - a.score)
  || String(a.date || '9999').localeCompare(String(b.date || '9999'))
  || String(a.id).localeCompare(String(b.id))

/**
 * @param {object} p
 * @param {object} p.agenda     résultat de buildAgenda
 * @param {Array}  p.crmItems   buildCrmInsights(...).items
 * @param {string} [p.today]    AAAA-MM-JJ (défaut : aujourd'hui, heure locale)
 * @param {string} [p.now]      HH:MM : écarte les rendez-vous du jour passés depuis plus d'1 h
 * @param {number} [p.limit=3]  nombre d'éléments dans `top`
 * @returns {{ top: object[], rest: object[], total: number }}
 */
export function buildPriorities({ agenda = {}, crmItems = [], today = localISO(), now = null, limit = 3 } = {}) {
  const all = [...fromAgenda(agenda || {}, today, now), ...fromCrm(crmItems, today)].sort(compare)
  const seen = new Set()
  const list = []
  for (const it of all) {
    const keys = [it.id, it.dedupe].filter(Boolean)
    if (keys.some(k => seen.has(k))) continue
    keys.forEach(k => seen.add(k))
    const item = { ...it }
    delete item.dedupe
    delete item.date
    list.push(item)
  }
  return { top: list.slice(0, limit), rest: list.slice(limit), total: list.length }
}

// ─── Phrase de synthèse IA (« Le mot du jour ») ───

export const MOT_DU_JOUR_SYSTEM = "Tu es l'assistant d'un maître d'œuvre BTP qui consulte son téléphone sur chantier. "
  + 'À partir de ses priorités du jour, écris une ou deux phrases en français pour lui dire par quoi commencer. '
  + 'Ton direct, tutoiement, sans emoji, sans liste, sans titre, sans mise en forme. Ne reprends pas tous les détails.'

// Message envoyé à l'IA (tableau de bord et mail du matin)
export const motDuJourPrompt = (digest) => `Mes priorités du jour :\n${digest}`

// Réponse de l'IA → une phrase propre (sans Markdown, 320 caractères max)
export const cleanMotDuJour = (t) => String(t || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 320)

// Résumé compact envoyé à l'IA : titres + raisons, rien d'autre.
export function prioritiesDigest(top = [], total = top.length) {
  const lines = top.map((p, i) => `${i + 1}. ${p.title} — ${p.reason}`)
  const more = total - top.length
  if (more > 0) lines.push(`(et ${more} autre${more > 1 ? 's' : ''} point${more > 1 ? 's' : ''} moins urgent${more > 1 ? 's' : ''})`)
  return lines.join('\n')
}

// Hash court (djb2) pour savoir si la liste a changé
export function hashText(s = '') {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
