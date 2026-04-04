/**
 * Google OAuth Callback
 *
 * Avec PKCE flow, cette route est appelée après que l'utilisateur
 * ait autorisé l'accès sur la page Google.
 *
 * Le code d'autorisation est passé en query parameter et échangé
 * côté client via supabase.auth.exchangeCodeForSession()
 */
export const dynamic = 'force-dynamic'

export async function GET(request) {
  // Récupérer le code d'autorisation depuis l'URL
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  // En cas d'erreur OAuth
  if (error) {
    console.error(`OAuth Error: ${error} - ${error_description}`)
    return Response.redirect(
      new URL(`/?error=${encodeURIComponent(error_description || error)}`, appUrl).toString()
    )
  }

  // Le code sera traité côté client via supabase.auth.exchangeCodeForSession()
  // Cette route redirige simplement vers la page d'accueil
  return Response.redirect(appUrl)
}
