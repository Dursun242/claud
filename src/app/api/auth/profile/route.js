import { createClient } from '@supabase/supabase-js'

export async function POST(request) {
  try {
    const { email } = await request.json()
    if (!email) return Response.json({ profile: null }, { status: 400 })

    // Utilise service role key si dispo, sinon anon key
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const sb  = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } })

    const { data, error } = await sb
      .from('authorized_users')
      .select('*')
      .eq('email', email)
      .eq('actif', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (normal), autres erreurs = vrai problème
      console.error('Profile lookup error:', error.message)
    }

    return Response.json({ profile: data || null })
  } catch (e) {
    return Response.json({ profile: null, error: e.message }, { status: 500 })
  }
}
