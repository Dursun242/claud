// Route /api/devis/qonto — enregistre un devis de l'application dans Qonto.
//
// Réservée au staff (verifyStaff). Deux actions :
//   - "numbers" : numéros des devis déjà présents dans Qonto, pour que la
//                 numérotation de l'application continue à la suite.
//   - "sync"    : crée (ou met à jour) le devis dans Qonto avec le même
//                 numéro. Le client Qonto est retrouvé (email / nom) ou créé.
//
// Les données du devis sont relues en base (service role) : le front
// n'envoie que l'identifiant, rien de ce qui part chez Qonto ne vient du
// navigateur. Le token Qonto est celui de la table `settings` (onglet Qonto).
//
// POST sans retry (fetchWithRetry maxRetries 0) : un retry après un timeout
// pourrait créer le devis deux fois.

import { verifyStaff } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { nextDevisNumero } from '@/app/lib/devis'
import {
  toQontoQuote, qontoClientPayload, matchQontoClient,
  isNumberTaken, isUnitRejected, qontoErrorDetail, totalsMismatch, qontoFingerprint,
} from '@/app/lib/qontoDevis'

export const maxDuration = 30

const log = createLogger('devis-qonto')
const checkRate = createRateLimiter({ limit: 20, windowMs: 60_000 })
const QONTO = 'https://thirdparty.qonto.com/v2'
const MAX_PAGES = 5

class QontoError extends Error {
  constructor(message, status = 502, code = null) { super(message); this.status = status; this.code = code }
}

async function getQontoToken(admin) {
  const { data, error } = await admin.from('settings').select('value').eq('key', 'qonto-token').maybeSingle()
  return error ? null : (data?.value || null)
}

async function qonto(token, method, path, body) {
  const res = await fetchWithRetry(`${QONTO}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    timeoutMs: 15_000,
    maxRetries: method === 'GET' ? 2 : 0,
    retryOn5xx: method === 'GET',
  })
  const text = await res.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (res.status === 401 || res.status === 403) {
    log.error(`${method} ${path} → ${res.status}`, text.slice(0, 300))
    throw new QontoError(
      'Qonto refuse l’accès : la clé API (onglet Qonto) doit avoir le droit de créer des devis et des clients. Regénère-la dans Qonto → Paramètres → Intégrations & API.',
      502, 'QONTO_FORBIDDEN',
    )
  }
  return { status: res.status, ok: res.ok, json, text }
}

async function listAll(token, path, key) {
  const out = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await qonto(token, 'GET', `${path}${sep}per_page=100&page=${page}`)
    if (!r.ok) throw new QontoError(`Lecture Qonto impossible (${r.status}) ${qontoErrorDetail(r.json)}`.trim())
    out.push(...(r.json?.[key] || []))
    if (!r.json?.meta?.next_page) break
  }
  return out
}

const qontoNumbers = async (token) =>
  (await listAll(token, '/quotes?sort_by=created_at:desc', 'quotes')).map(q => q.number).filter(Boolean)

async function resolveClient(token, devis, contact) {
  if (devis.qonto_client_id) return devis.qonto_client_id
  if (!contact) throw new QontoError('Associe un contact (le client) à l’affaire avant d’enregistrer le devis dans Qonto.', 400)
  const found = matchQontoClient(await listAll(token, '/clients', 'clients'), contact)
  if (found?.id) return found.id
  const r = await qonto(token, 'POST', '/clients', qontoClientPayload(contact))
  const id = r.json?.client?.id || r.json?.id
  if (!r.ok || !id) {
    log.error(`création client ${r.status}`, r.text.slice(0, 500))
    throw new QontoError(`Création du client dans Qonto refusée : ${qontoErrorDetail(r.json) || r.status}. Complète la fiche contact (nom, adresse, code postal, ville).`, 422)
  }
  return id
}

async function pushQuote(token, devis, clientId) {
  const send = (withUnits) => {
    const body = toQontoQuote(devis, { clientId, withUnits })
    return devis.qonto_quote_id
      ? qonto(token, 'PATCH', `/quotes/${encodeURIComponent(devis.qonto_quote_id)}`, body)
      : qonto(token, 'POST', '/quotes', body)
  }
  let r = await send(true)
  // Devis supprimé côté Qonto : on le recrée
  if (r.status === 404 && devis.qonto_quote_id) {
    devis = { ...devis, qonto_quote_id: null }
    r = await send(true)
  }
  // Unités imposées par Qonto : on renvoie sans unité plutôt que d'échouer
  if (isUnitRejected(r.status, r.json || r.text)) r = await send(false)
  return r
}

async function sync(admin, token, devisId) {
  const { data: devis, error } = await admin.from('crm_devis').select('*').eq('id', devisId).maybeSingle()
  if (error) throw new QontoError('Lecture du devis impossible : ' + error.message, 500)
  if (!devis) throw new QontoError('Devis introuvable.', 404)
  if (!('qonto_quote_id' in devis)) {
    throw new QontoError('Appliquer la migration 028_crm_devis_qonto.sql sur Supabase pour enregistrer les devis dans Qonto.', 409, 'MIGRATION_028')
  }
  if (!(devis.lignes || []).some(l => l.type !== 'titre')) throw new QontoError('Le devis n’a aucune ligne.', 400)

  const { data: opp } = await admin.from('crm_opportunites').select('id, titre, contact_id').eq('id', devis.opportunite_id).maybeSingle()
  const { data: contact } = opp?.contact_id
    ? await admin.from('contacts').select('*').eq('id', opp.contact_id).maybeSingle()
    : { data: null }

  const clientId = await resolveClient(token, devis, contact)
  const r = await pushQuote(token, devis, clientId)

  if (!r.ok) {
    if (isNumberTaken(r.status, r.json || r.text)) {
      const { data: rows } = await admin.from('crm_devis').select('numero')
      const suggestion = nextDevisNumero([...(rows || []), ...(await qontoNumbers(token)).map(numero => ({ numero }))])
      throw new QontoError(
        `Le numéro ${devis.numero} existe déjà dans Qonto. Prochain numéro libre : ${suggestion} — ouvre le devis pour changer son numéro.`,
        409, 'NUMBER_TAKEN',
      )
    }
    log.error(`devis ${r.status}`, r.text.slice(0, 800))
    throw new QontoError(`Qonto a refusé le devis : ${qontoErrorDetail(r.json) || `erreur ${r.status}`}`, 422)
  }

  const quote = r.json?.quote || r.json || {}
  const patch = {
    qonto_quote_id: quote.id || devis.qonto_quote_id,
    qonto_client_id: clientId,
    qonto_url: quote.quote_url || null,
    qonto_synced_at: new Date().toISOString(),
  }
  // Numérotation automatique active chez Qonto : on reprend son numéro
  const renumbered = quote.number && quote.number !== devis.numero ? quote.number : null
  let saved = null
  if (renumbered) {
    const res = await admin.from('crm_devis')
      .update({ ...patch, numero: renumbered, qonto_hash: qontoFingerprint({ ...devis, numero: renumbered }) })
      .eq('id', devis.id).select().single()
    if (!res.error) saved = res.data
  }
  if (!saved) {
    const res = await admin.from('crm_devis')
      .update({ ...patch, qonto_hash: qontoFingerprint(devis) }).eq('id', devis.id).select().single()
    if (res.error) throw new QontoError('Devis créé dans Qonto mais lien non enregistré : ' + res.error.message, 500)
    saved = res.data
  }
  return {
    devis: saved,
    qontoNumber: quote.number || devis.numero,
    renumbered: saved.numero !== devis.numero ? saved.numero : null,
    mismatch: totalsMismatch(quote, devis),
    created: !devis.qonto_quote_id,
  }
}

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) return Response.json({ error: 'Trop de requêtes — attendez 1 minute.' }, { status: 429 })
    const { user, status } = await verifyStaff(request)
    if (!user) return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })

    const body = await request.json().catch(() => ({}))
    const admin = adminClient()
    const token = await getQontoToken(admin)
    if (!token) {
      return Response.json({ error: 'Qonto n’est pas connecté : saisis la clé API dans l’onglet Qonto.', code: 'QONTO_NOT_CONFIGURED' }, { status: 503 })
    }

    if (body.action === 'numbers') {
      return Response.json({ ok: true, data: { numbers: await qontoNumbers(token) } })
    }
    if (body.action === 'sync') {
      if (!body.devisId || typeof body.devisId !== 'string') return Response.json({ error: 'Devis manquant' }, { status: 400 })
      return Response.json({ ok: true, data: await sync(admin, token, body.devisId) })
    }
    return Response.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (err) {
    if (err instanceof QontoError) return Response.json({ error: err.message, code: err.code }, { status: err.status })
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
