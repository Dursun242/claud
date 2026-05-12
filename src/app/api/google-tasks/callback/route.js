// GET /api/google-tasks/callback?code=...&state=...
//
// Endpoint de retour OAuth. Appelé par Google après que l'utilisateur ait
// accepté le consent. Aucun Bearer JWT ici — Google nous rappelle via une
// redirection navigateur. La sécurité repose sur :
//   1) Le state cookie HttpOnly posé par /connect → vérification CSRF.
//   2) Le fait que seul un admin a pu poser ce cookie (via /connect).
//
// Si tout est OK : on échange le code contre un refresh_token, on
// persiste en base, on redirige vers l'app avec ?google_tasks=connected.

import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  saveOAuthState,
} from '@/app/lib/googleTasks'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('google-tasks/callback')

const STATE_COOKIE = 'gt_oauth_state'

function redirectWithStatus(status) {
  // L'UI lit le query param pour afficher un toast au retour.
  return Response.redirect(new URL(`/?google_tasks=${status}`, _appBaseUrl()), 302)
}

function _appBaseUrl() {
  // En prod, NEXT_PUBLIC_APP_URL ou inféré du redirect URI configuré.
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.GOOGLE_TASKS_REDIRECT_URI?.replace(/\/api\/google-tasks\/callback$/, '') ||
    'http://localhost:3000'
  )
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      log.warn('Google a renvoyé une erreur', error)
      return redirectWithStatus('error')
    }
    if (!code || !state) {
      return redirectWithStatus('error')
    }

    const cookieStore = await cookies()
    const cookieState = cookieStore.get(STATE_COOKIE)?.value
    if (!cookieState || cookieState !== state) {
      log.warn('state mismatch', { cookieState: !!cookieState, state })
      return redirectWithStatus('csrf')
    }
    // Cookie consommé → on l'efface pour empêcher un replay.
    cookieStore.set(STATE_COOKIE, '', { maxAge: 0, path: '/' })

    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // refresh_token absent = l'utilisateur a déjà autorisé l'app sans
      // qu'on demande prompt=consent. Notre /connect impose prompt=consent
      // donc ne devrait pas arriver, mais on log pour être safe.
      log.error('refresh_token absent de la réponse Google', { keys: Object.keys(tokens) })
      return redirectWithStatus('no-refresh-token')
    }

    // Récupère l'email du compte connecté (informatif, pour l'UI).
    let googleEmail = null
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userinfoRes.ok) {
        const info = await userinfoRes.json()
        googleEmail = info.email || null
      }
    } catch (e) {
      log.warn('userinfo fetch failed (non-bloquant)', e.message)
    }

    const accessExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()
    await saveOAuthState({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: accessExpiresAt,
      google_email: googleEmail,
      connected_at: new Date().toISOString(),
      tasks_list_id: null,           // sera créé/peuplé à la 1ère sync
      last_sync_error: null,
    })

    log.info('connecté', { email: googleEmail })
    return redirectWithStatus('connected')
  } catch (err) {
    log.error('exception', err)
    return redirectWithStatus('error')
  }
}
