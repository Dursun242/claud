// GET /api/google-tasks/connect
//
// Initie le flow OAuth Google Tasks. Le bouton "Connecter" appelle cette
// route en fetch() avec le Bearer JWT, récupère l'URL de consent Google,
// puis redirige le navigateur dessus.
//
// On utilise un cookie HttpOnly avec un `state` aléatoire pour la
// protection CSRF du callback (le state du cookie doit matcher celui que
// Google nous renvoie dans la querystring).

import { cookies } from 'next/headers'
import { verifyAuth } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import { buildAuthorizationUrl } from '@/app/lib/googleTasks'
import { createLogger } from '@/app/lib/logger'
import crypto from 'crypto'

const log = createLogger('google-tasks/connect')

const STATE_COOKIE = 'gt_oauth_state'
const STATE_TTL_SECONDS = 10 * 60 // 10 min, largement suffisant pour un consent flow

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    // Vérifie que l'appelant est admin — la connexion Google Tasks est un
    // setting global qui touche le compte de l'entreprise.
    const { data: au } = await adminClient()
      .from('authorized_users')
      .select('role')
      .eq('email', user.email)
      .maybeSingle()
    if (au?.role !== 'admin') {
      return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const state = crypto.randomBytes(32).toString('hex')
    const url = buildAuthorizationUrl(state)

    const cookieStore = await cookies()
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // 'lax' nécessaire : le callback Google arrive via top-level navigation cross-site
      path: '/',
      maxAge: STATE_TTL_SECONDS,
    })

    return Response.json({ url })
  } catch (err) {
    log.error('exception', err)
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
