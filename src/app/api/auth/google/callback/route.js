/**
 * Google OAuth Callback Handler
 * Exchanges auth code for access token and stores it
 */

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return Response.json({ error }, { status: 400 });
    }

    if (!code) {
      return Response.json({ error: 'No code provided' }, { status: 400 });
    }

    // Exchange code for token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'https://claude-dusky.vercel.app'}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokenData = await tokenResponse.json();

    // Redirect with token in URL (or store in secure cookie)
    // For now, redirect to dashboard with token as query param
    // In production, use httpOnly cookies
    const redirectUrl = new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'https://claude-dusky.vercel.app');
    redirectUrl.searchParams.set('google_token', tokenData.access_token);
    if (tokenData.refresh_token) {
      redirectUrl.searchParams.set('refresh_token', tokenData.refresh_token);
    }

    return Response.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('OAuth callback error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
