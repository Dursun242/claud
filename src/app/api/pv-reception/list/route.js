// Route /api/pv-reception/list
// GET → Récupère les PV d'un chantier

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

// Client Supabase qui propage le JWT de l'utilisateur dans chaque appel.
// Le 2e argument doit être l'ANON_KEY (clé d'API publique), pas le JWT —
// le JWT va dans le header Authorization global pour que les RLS policies
// voient le bon auth.uid().
function getUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const chantierId = searchParams.get('chantierId')

    if (!chantierId) {
      return Response.json({ error: 'chantierId requis' }, { status: 400 })
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return Response.json({ error: 'Token manquant' }, { status: 401 })
    const supa = getUserClient(token)

    const { data: pvs, error } = await supa
      .from('proces_verbaux_reception')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[pv-list] erreur:', error)
      return Response.json({ error: 'Erreur récupération PV' }, { status: 500 })
    }

    return Response.json({
      ok: true,
      count: pvs.length,
      data: pvs
    })
  } catch (err) {
    console.error('[pv-list exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
