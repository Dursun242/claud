/**
 * Google OAuth Callback — Feature désactivée
 * L'intégration Google Calendar a été retirée de l'application.
 * Cette route redirige simplement vers l'accueil sans exposer de tokens.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://claude-dusky.vercel.app';
  return Response.redirect(new URL('/', appUrl).toString());
}
