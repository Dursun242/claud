/**
 * Route désactivée — plus utilisée depuis le passage au flow OAuth implicit (Supabase).
 * Les tokens sont désormais gérés directement côté client par le SDK Supabase.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('[auth/google/callback] NEXT_PUBLIC_APP_URL non configurée')
    return new Response(null, { status: 500 })
  }
  return Response.redirect(new URL('/', appUrl).toString())
}
