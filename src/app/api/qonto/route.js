// Route /api/qonto — proxy lecture seule vers l'API Qonto v2.
//
// Sécurité :
// - Vérifie un JWT Supabase dans le header Authorization avant tout appel
//   (évite qu'un tiers anonyme consomme le token Qonto).
// - Le token Qonto N'EST PLUS passé depuis le client. Le serveur le
//   récupère directement dans Supabase via le service role key,
//   depuis la table `settings` (key='qonto-token'). Le token ne
//   transite donc jamais dans le body d'une requête HTTP vers
//   /api/qonto — plus de risque de leak dans les logs Vercel.
//
// Le token arrive dans Supabase uniquement lors du setup initial
// (QontoV.saveToken) via le client Supabase direct (HTTPS mTLS).

import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'

const log = createLogger('qonto')

// Récupère le token Qonto stocké dans la table settings côté serveur.
// Utilise le service role key pour bypasser les RLS.
let _qontoTokenCache = null
let _qontoTokenCachedAt = 0
// TTL court (5s) : le SELECT Supabase prend ~100ms et n'est pas un bottleneck,
// mais un TTL plus long allongerait la fenêtre entre une révocation du token
// côté Qonto et sa détection ici. 5s = on couvre les rafales d'appels
// parallèles (fetchAll en fait 3) sans garder le token trop longtemps
// en RAM du process.
const TOKEN_CACHE_TTL = 5_000

async function getQontoToken() {
  // Cache court pour limiter le nombre de SELECT Supabase en rafale
  // (fetchAll fait 3 appels en parallèle)
  const now = Date.now()
  if (_qontoTokenCache && (now - _qontoTokenCachedAt) < TOKEN_CACHE_TTL) {
    return _qontoTokenCache
  }
  const admin = adminClient()
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'qonto-token')
    .maybeSingle()
  if (error || !data?.value) return null
  _qontoTokenCache = data.value
  _qontoTokenCachedAt = now
  return _qontoTokenCache
}

export async function POST(request) {
  try {
    // 1. Auth JWT Supabase obligatoire
    const user = await verifyAuth(request)
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Body : uniquement `endpoint`, pas de token
    const body = await request.json()
    const { endpoint } = body || {}

    if (!endpoint) {
      return Response.json({ error: 'Endpoint manquant' }, { status: 400 })
    }

    // Whitelist allowed endpoints (read-only)
    const allowed = ['client_invoices', 'quotes', 'clients', 'attachments']
    const base = endpoint.split('?')[0]
    if (!allowed.some(a => base.includes(a))) {
      return Response.json({ error: 'Endpoint not allowed' }, { status: 403 })
    }

    // 3. Récupération du token Qonto depuis Supabase (service role)
    const qontoToken = await getQontoToken()
    if (!qontoToken) {
      return Response.json(
        { error: 'Token Qonto non configuré. Va dans l\'onglet Qonto pour le saisir.' },
        { status: 400 }
      )
    }

    // 4. Appel Qonto (le header Authorization attendu par Qonto est
    //    directement "login:secret-key" — pas de "Bearer " devant)
    const response = await fetchWithRetry(`https://thirdparty.qonto.com/v2/${endpoint}`, {
      headers: {
        'Authorization': qontoToken,
        'Content-Type': 'application/json',
      },
      timeoutMs: 15000,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      log.error(`${response.status}`, errText)
      // Si 401 → le token stocké n'est plus valide, on invalide le cache
      if (response.status === 401) _qontoTokenCache = null
      return Response.json({ error: 'Erreur Qonto' }, { status: response.status })
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    log.error('proxy exception', error?.message || error)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
