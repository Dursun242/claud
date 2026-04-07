import { createClient } from '@supabase/supabase-js'

/**
 * API route pour gérer les utilisateurs autorisés.
 * Utilise la service role key pour bypasser la RLS Supabase.
 * Nécessite SUPABASE_SERVICE_ROLE_KEY dans les variables Vercel.
 */

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans les variables Vercel.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey)
}

// GET — liste tous les utilisateurs
export async function GET() {
  try {
    const supabaseAdmin = getAdminClient()
    const { data, error } = await supabaseAdmin
      .from('authorized_users')
      .select('*')
      .order('prenom')
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, data: data || [] })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// POST — ajoute ou met à jour un utilisateur
export async function POST(request) {
  try {
    const supabaseAdmin = getAdminClient()
    const { email, prenom, nom, role } = await request.json()

    if (!email?.trim() || !prenom?.trim()) {
      return Response.json({ error: 'Email et prénom requis.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('authorized_users')
      .upsert({
        email: email.trim().toLowerCase(),
        prenom: prenom.trim(),
        nom: (nom || '').trim(),
        role: role || 'salarie',
        actif: true,
      }, { onConflict: 'email' })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, data })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — supprime un utilisateur par id
export async function DELETE(request) {
  try {
    const supabaseAdmin = getAdminClient()
    const { id } = await request.json()
    if (!id) return Response.json({ error: 'ID requis.' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('authorized_users')
      .delete()
      .eq('id', id)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
