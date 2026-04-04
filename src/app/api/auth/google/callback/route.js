/**
 * Google OAuth Callback
 * Supabase gère automatiquement le callback via /auth/v1/callback
 * Cette route redirige l'utilisateur vers la page d'accueil après authentification
 */
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Vérifier si la session est établie via les URL params/cookies
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Si erreur OAuth
  if (error) {
    console.error('Google OAuth error:', error);
    return Response.redirect(new URL('/?error=google_auth_failed', appUrl).toString());
  }

  // Rediriger vers l'accueil (Supabase gère la session automatiquement)
  return Response.redirect(new URL('/', appUrl).toString());
}
