// Route /api/qonto/token — connexion Qonto (jeton login:clé-secrète).
//
// Le jeton est stocké dans `settings` (key 'qonto-token') et n'est lu que
// côté serveur (service role) : le navigateur ne reçoit jamais la clé
// secrète, seulement l'état de connexion et le login.
//
//   GET    → { ok, connected, login }        staff
//   POST   { token } → { ok, login }          admin
//   DELETE → { ok }                           admin

import { verifyStaff } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('qonto-token')
const KEY = 'qonto-token'

async function staffOr401(request, { adminOnly = false } = {}) {
  const { user, status } = await verifyStaff(request)
  if (!user) {
    return { error: Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status }) }
  }
  if (adminOnly && user.profile?.role !== 'admin') {
    return { error: Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 }) }
  }
  return { user }
}

const loginOf = (token) => String(token || '').split(':')[0]

export async function GET(request) {
  const { error } = await staffOr401(request)
  if (error) return error
  try {
    const { data, error: dbError } = await adminClient().from('settings').select('value').eq('key', KEY).maybeSingle()
    if (dbError) throw new Error(dbError.message)
    const token = data?.value
    const connected = !!(token && token.includes(':'))
    return Response.json({ ok: true, connected, login: connected ? loginOf(token) : null })
  } catch (e) {
    log.error('lecture', e?.message || e)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request) {
  const { error } = await staffOr401(request, { adminOnly: true })
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const token = String(body?.token || '').trim()
  // login:clé-secrète, sans espace ni retour à la ligne (le jeton part dans un en-tête HTTP)
  if (!/^[^:\s]+:\S+$/.test(token) || token.length > 500) {
    return Response.json({ error: 'Format invalide — doit être login:secret-key (avec deux-points).' }, { status: 400 })
  }
  try {
    const { error: dbError } = await adminClient().from('settings').upsert({ key: KEY, value: token })
    if (dbError) throw new Error(dbError.message)
    return Response.json({ ok: true, login: loginOf(token) })
  } catch (e) {
    log.error('enregistrement', e?.message || e)
    return Response.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}

export async function DELETE(request) {
  const { error } = await staffOr401(request, { adminOnly: true })
  if (error) return error
  try {
    const { error: dbError } = await adminClient().from('settings').delete().eq('key', KEY)
    if (dbError) throw new Error(dbError.message)
    return Response.json({ ok: true })
  } catch (e) {
    log.error('suppression', e?.message || e)
    return Response.json({ error: 'Déconnexion impossible' }, { status: 500 })
  }
}
