import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Auth callback route — échange le code PKCE contre une session Supabase.
 * Appelée automatiquement par Supabase après l'OAuth Google.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: false } }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
    console.error('Auth callback error:', error.message)
  }

  // En cas d'échec, redirige vers l'accueil (le client-side gèrera l'implicit flow)
  return NextResponse.redirect(new URL('/', origin))
}
