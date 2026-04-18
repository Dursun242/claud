// Route /api/pv-reception/list
// GET → Récupère les PV d'un chantier, paginés.
//
// Query params :
//   chantierId (requis)
//   limit (optionnel, défaut 50, max 200)
//   offset (optionnel, défaut 0)
//
// Réponse :
//   { ok, count, data, hasMore, limit, offset }

import { verifyAuth } from '@/app/lib/auth'
import { userClientFromToken, extractBearerToken } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('pv-list')

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function parseBoundedInt(raw, fallback, { min = 0, max = Infinity } = {}) {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const chantierId = searchParams.get('chantierId')
    if (!chantierId) {
      return Response.json({ error: 'chantierId requis' }, { status: 400 })
    }

    const limit = parseBoundedInt(searchParams.get('limit'), DEFAULT_LIMIT, {
      min: 1,
      max: MAX_LIMIT,
    })
    const offset = parseBoundedInt(searchParams.get('offset'), 0, { min: 0 })

    const token = extractBearerToken(request)
    if (!token) return Response.json({ error: 'Token manquant' }, { status: 401 })
    const supa = userClientFromToken(token)

    // On demande `count: 'exact'` pour pouvoir calculer hasMore sans fetch
    // une 2e fois, mais `head: false` pour bénéficier du même round-trip
    // que le select. Supabase renvoie alors les lignes + le total.
    const { data, error, count } = await supa
      .from('proces_verbaux_reception')
      .select('*', { count: 'exact' })
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      log.error('select', error.message)
      return Response.json({ error: 'Erreur récupération PV' }, { status: 500 })
    }

    return Response.json({
      ok: true,
      count: count ?? data.length,
      data,
      limit,
      offset,
      hasMore: (count ?? 0) > offset + data.length,
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
