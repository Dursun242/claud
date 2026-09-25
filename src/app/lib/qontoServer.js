// qontoServer.js — appels Qonto côté serveur partagés (statut, suppression
// d'un devis). Token Qonto : table `settings` (key 'qonto-token').
//
// Qonto ne documente pas d'endpoint pour accepter / annuler un devis :
// on tente un PATCH du statut et on vérifie le statut renvoyé. Si Qonto
// l'ignore ou le refuse, applied = false et le front invite à le faire
// dans Qonto.

import { fetchWithRetry } from './fetchWithRetry'

const QONTO = 'https://thirdparty.qonto.com/v2'
const QONTO_STATUS = { 'Accepté': 'approved', 'Refusé': 'canceled' }

export async function getQontoToken(admin) {
  const { data, error } = await admin.from('settings').select('value').eq('key', 'qonto-token').maybeSingle()
  return error ? null : (data?.value || null)
}

async function call(token, method, path, body) {
  const res = await fetchWithRetry(`${QONTO}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    timeoutMs: 15_000,
    maxRetries: 0,
    retryOn5xx: false,
  })
  const text = await res.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, ok: res.ok, json }
}

/** Reporte « Accepté » / « Refusé » sur le devis Qonto. */
export async function pushQuoteStatus(token, quoteId, statut) {
  const target = QONTO_STATUS[statut]
  if (!token || !quoteId || !target) return { applied: false }
  const r = await call(token, 'PATCH', `/quotes/${encodeURIComponent(quoteId)}`, { status: target })
  const quote = r.json?.quote || r.json || {}
  return { applied: r.ok && quote.status === target, status: r.status }
}

/** Supprime le devis dans Qonto. Déjà absent (404) = considéré supprimé. */
export async function deleteQuote(token, quoteId) {
  const r = await call(token, 'DELETE', `/quotes/${encodeURIComponent(quoteId)}`)
  if (r.ok || r.status === 404) return { deleted: true }
  const detail = Array.isArray(r.json?.errors)
    ? r.json.errors.map(e => e.detail || e.code).filter(Boolean).join(' · ')
    : (r.json?.message || '')
  return { deleted: false, status: r.status, detail: String(detail).slice(0, 300) }
}
