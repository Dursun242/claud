// Route /api/admin/demo-mode
//
// GET  → retourne l'état actuel { enabled: true|false }
// POST → toggle (admin only) : { enabled: true|false }
//
// Le flag est stocké dans settings.demo_mode ('on' | 'off').
// Quand 'on', /api/admin/users auto-inscrit les emails Google inconnus
// en tant que client "DémoMOA" (accès au chantier démo uniquement).

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

async function readMode(supa) {
  const { data } = await supa.from('settings').select('value').eq('key', 'demo_mode').maybeSingle()
  return data?.value === 'on'
}

async function requireAdmin(request) {
  const user = await verifyAuth(request)
  if (!user) return { error: 'Non autorisé', status: 401 }
  const supa = admin()
  const { data: caller } = await supa.from('authorized_users').select('role').eq('email', user.email?.toLowerCase().trim()).maybeSingle()
  if (caller?.role !== 'admin') return { error: 'Accès admin requis', status: 403 }
  return { user, supa }
}

export async function GET(request) {
  const ctx = await requireAdmin(request)
  if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
  try {
    const enabled = await readMode(ctx.supa)
    return Response.json({ enabled })
  } catch (err) {
    console.error('[demo-mode GET]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request) {
  const ctx = await requireAdmin(request)
  if (ctx.error) return Response.json({ error: ctx.error }, { status: ctx.status })
  try {
    const { enabled } = await request.json()
    const value = enabled ? 'on' : 'off'
    const { error } = await ctx.supa
      .from('settings')
      .upsert({ key: 'demo_mode', value }, { onConflict: 'key' })
    if (error) {
      console.error('[demo-mode POST]', error)
      return Response.json({ error: 'Erreur serveur' }, { status: 500 })
    }
    // Log l'action pour traçabilité (audit)
    await ctx.supa.from('activity_logs').insert({
      user_email: ctx.user.email?.toLowerCase().trim() || null,
      action: 'update',
      entity_type: 'settings',
      entity_id: 'demo_mode',
      entity_label: `Mode démo → ${enabled ? 'ACTIVÉ' : 'désactivé'}`,
      metadata: { enabled },
    })
    return Response.json({ ok: true, enabled: !!enabled })
  } catch (err) {
    console.error('[demo-mode POST exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
