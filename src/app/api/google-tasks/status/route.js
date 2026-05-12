// GET    /api/google-tasks/status — renvoie l'état de connexion
// DELETE /api/google-tasks/status — révoque la connexion (efface la ligne google_oauth_state)
//
// Réservé aux admins.

import { verifyAuth } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import { getOAuthState, deleteOAuthState } from '@/app/lib/googleTasks'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('google-tasks/status')

async function requireAdmin(request) {
  const user = await verifyAuth(request)
  if (!user) return { error: 'Non autorisé', status: 401 }
  const { data: au } = await adminClient()
    .from('authorized_users')
    .select('role')
    .eq('email', user.email)
    .maybeSingle()
  if (au?.role !== 'admin') {
    return { error: 'Accès réservé aux administrateurs', status: 403 }
  }
  return { user }
}

export async function GET(request) {
  try {
    const guard = await requireAdmin(request)
    if (guard.error) return Response.json({ error: guard.error }, { status: guard.status })

    const state = await getOAuthState()
    if (!state) {
      return Response.json({ connected: false })
    }
    return Response.json({
      connected: true,
      email: state.google_email,
      connectedAt: state.connected_at,
      lastFullSyncAt: state.last_full_sync_at,
      lastSyncError: state.last_sync_error,
      tasksListId: state.tasks_list_id,
    })
  } catch (err) {
    log.error('GET exception', err)
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const guard = await requireAdmin(request)
    if (guard.error) return Response.json({ error: guard.error }, { status: guard.status })

    await deleteOAuthState()
    log.info('connexion révoquée')
    return Response.json({ ok: true })
  } catch (err) {
    log.error('DELETE exception', err)
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
