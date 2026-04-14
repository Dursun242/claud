// Route /api/admin/reset-demo-data
//
// POST → appelle la fonction SQL seed_demo_data() qui purge et recrée
//        le chantier démo "Villa Moreau" avec OS / CR / tâches à neuf.
//
// Accès : admin uniquement.
// Log : trace une entrée activity_logs 'reset_demo'.

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })
    const supa = admin()
    const { data: caller } = await supa
      .from('authorized_users')
      .select('role')
      .eq('email', user.email?.toLowerCase().trim())
      .maybeSingle()
    if (caller?.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 })

    // Appel de la fonction SQL
    const { error: rpcErr } = await supa.rpc('seed_demo_data')
    if (rpcErr) {
      console.error('[reset-demo-data rpc]', rpcErr)
      return Response.json({ error: 'Reset échoué : ' + rpcErr.message }, { status: 500 })
    }

    // Log audit
    await supa.from('activity_logs').insert({
      user_email: user.email?.toLowerCase().trim() || null,
      action: 'reset_demo',
      entity_type: 'system',
      entity_label: 'Réinitialisation des données démo (Villa Moreau)',
    })

    return Response.json({ ok: true, message: 'Données démo réinitialisées' })
  } catch (err) {
    console.error('[reset-demo-data exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
