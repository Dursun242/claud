import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans les variables Vercel.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

// Vérifie le JWT Supabase et retourne l'utilisateur, ou null si invalide
async function verifyAuth(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { data: { user } } = await client.auth.getUser(token)
  return user || null
}

// GET — liste les utilisateurs autorisés
// - Admin : liste complète
// - User normal : uniquement son propre profil (évite la fuite d'infos collègues)
export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = getAdminClient()

    // Récupère d'abord le profil du caller pour vérifier son rôle
    const email = user.email?.trim().toLowerCase()
    const { data: caller, error: callerErr } = await supabaseAdmin
      .from('authorized_users')
      .select('*')
      .eq('email', email)
      .maybeSingle()
    if (callerErr) {
      console.error('[admin/users GET] caller lookup:', callerErr)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // User non-admin : on ne renvoie que son propre profil
    if (caller?.role !== 'admin') {
      return Response.json({ ok: true, data: caller ? [caller] : [] })
    }

    // Admin : liste complète
    const { data, error } = await supabaseAdmin
      .from('authorized_users')
      .select('*')
      .order('prenom')
    if (error) {
      console.error('[admin/users GET] select:', error)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    return Response.json({ ok: true, data: data || [] })
  } catch (err) {
    console.error('[admin/users GET] exception:', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST — ajoute ou met à jour un utilisateur (admin uniquement)
export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = getAdminClient()

    // Vérifier que l'appelant est bien admin
    const { data: caller } = await supabaseAdmin
      .from('authorized_users')
      .select('role')
      .eq('email', user.email)
      .single()
    if (caller?.role !== 'admin') return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

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

    if (error) {
      console.error('[admin/users POST] upsert:', error)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    return Response.json({ ok: true, data })
  } catch (err) {
    console.error('[admin/users POST] exception:', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE — supprime un utilisateur par id (admin uniquement)
export async function DELETE(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = getAdminClient()

    const { data: caller } = await supabaseAdmin
      .from('authorized_users')
      .select('role')
      .eq('email', user.email)
      .single()
    if (caller?.role !== 'admin') return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

    const { id } = await request.json()
    if (!id) return Response.json({ error: 'ID requis.' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('authorized_users')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[admin/users DELETE] delete:', error)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[admin/users DELETE] exception:', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
