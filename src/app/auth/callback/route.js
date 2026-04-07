/**
 * Route de callback PKCE — non utilisée actuellement.
 * Le client Supabase utilise le flow 'implicit' (tokens dans le hash fragment).
 * Conservée comme point d'entrée si on repasse en PKCE avec @supabase/ssr.
 */
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { origin } = new URL(request.url)
  return Response.redirect(new URL('/', origin))
}
