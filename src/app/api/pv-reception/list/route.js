// Route /api/pv-reception/list
// GET → Récupère les PV d'un chantier

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function getUserClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, token)
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
    const supa = getUserClient(token || '')

    const { data: pvs, error } = await supa
      .from('proces_verbaux_reception')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('date_creation', { ascending: false })

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
