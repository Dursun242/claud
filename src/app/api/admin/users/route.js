import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant dans les variables Vercel.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

// GET — liste les utilisateurs autorisés
// - Admin : liste complète
// - User normal : uniquement son propre profil (évite la fuite d'infos collègues)
// - Si le mode démo est ACTIVÉ et que l'email connecté n'existe pas en DB,
//   on l'auto-inscrit comme client "DémoMOA" (accès au chantier démo).
export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const supabaseAdmin = getAdminClient()

    // Récupère d'abord le profil du caller pour vérifier son rôle
    const email = user.email?.trim().toLowerCase()
    let { data: caller, error: callerErr } = await supabaseAdmin
      .from('authorized_users')
      .select('*')
      .eq('email', email)
      .maybeSingle()
    if (callerErr) {
      console.error('[admin/users GET] caller lookup:', callerErr)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Auto-provisioning démo : email inconnu + mode démo ON → création client
    if (!caller && email) {
      const { data: setting } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'demo_mode')
        .maybeSingle()
      if (setting?.value === 'on') {
        const { data: created, error: createErr } = await supabaseAdmin
          .from('authorized_users')
          .insert({
            email,
            prenom: 'DémoMOA',
            nom: 'Prospect',
            role: 'client',
            actif: true,
          })
          .select()
          .single()
        if (!createErr && created) {
          caller = created
          // Log audit : trace l'auto-inscription démo pour que le gérant voie
          // dans Admin → Journal quels prospects ont testé l'app.
          await supabaseAdmin.from('activity_logs').insert({
            user_email: email,
            action: 'demo_signup',
            entity_type: 'user',
            entity_id: created.id,
            entity_label: `Prospect démo — ${email}`,
            metadata: { provider: user.app_metadata?.provider || null },
          }).then(() => {}, () => {})
        } else if (createErr) {
          console.error('[admin/users GET] demo auto-provisioning:', createErr)
        }
      }
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
