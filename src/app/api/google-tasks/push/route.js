// POST /api/google-tasks/push
//
// Pousse UNE tâche ID Maîtrise vers Google Tasks. Appelée en fire-and-forget
// depuis SB.upsertTask() / SB.deleteTask() après chaque écriture Supabase.
// Si Google n'est pas connecté → no-op (200 ok=true mais skipped=true).
//
// Body :
//   { action: 'upsert' | 'delete', tache: { id, titre, statut, ... }, chantierLabel?: string }
//
// Côté upsert :
//   - Si tache.google_task_id existe → PATCH côté Google
//   - Sinon → INSERT côté Google, puis on persiste l'ID renvoyé dans taches.google_task_id
//
// Côté delete : DELETE côté Google si l'ID existe, sinon no-op.

import { verifyAuth } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import {
  getOAuthState,
  insertTask,
  patchTask,
  deleteTaskGoogle,
  tacheToGoogleTask,
} from '@/app/lib/googleTasks'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('google-tasks/push')

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const state = await getOAuthState()
    if (!state) {
      // Pas connecté → no-op silencieux. Évite que les appels caller depuis
      // upsertTask se prennent un 4xx en boucle.
      return Response.json({ ok: true, skipped: 'not-connected' })
    }

    const body = await request.json()
    const { action, tache, chantierLabel } = body || {}

    if (action === 'delete') {
      if (!tache?.google_task_id) {
        return Response.json({ ok: true, skipped: 'no-google-id' })
      }
      try {
        await deleteTaskGoogle(tache.google_task_id)
      } catch (err) {
        // 404 côté Google = déjà supprimée, on ignore.
        if (err.status !== 404) throw err
      }
      return Response.json({ ok: true })
    }

    if (action === 'upsert') {
      if (!tache?.id) return Response.json({ error: 'tache.id manquant' }, { status: 400 })

      // Résout le nom du chantier côté serveur si pas fourni (caller n'a
      // pas toujours la liste des chantiers sous la main).
      let label = chantierLabel
      if (!label && tache.chantier_id) {
        const { data: ch } = await adminClient()
          .from('chantiers')
          .select('nom, client')
          .eq('id', tache.chantier_id)
          .maybeSingle()
        label = ch?.nom || ch?.client || null
      }

      const payload = tacheToGoogleTask(tache, { chantierLabel: label })

      let googleTask
      if (tache.google_task_id) {
        try {
          googleTask = await patchTask(tache.google_task_id, payload)
        } catch (err) {
          // 404 = la tâche Google a été supprimée (par l'utilisateur côté
          // Google). On la re-crée plutôt que de planter.
          if (err.status === 404) {
            googleTask = await insertTask(payload)
          } else {
            throw err
          }
        }
      } else {
        googleTask = await insertTask(payload)
      }

      // Persiste l'ID + etag côté Supabase pour les prochains push.
      const sb = adminClient()
      await sb.from('taches').update({
        google_task_id: googleTask.id,
        google_etag: googleTask.etag,
        synced_at: new Date().toISOString(),
      }).eq('id', tache.id)

      return Response.json({ ok: true, googleTaskId: googleTask.id })
    }

    return Response.json({ error: 'action invalide' }, { status: 400 })
  } catch (err) {
    log.error('exception', err)
    // On enregistre l'erreur dans google_oauth_state pour que l'UI puisse
    // l'afficher (debug utilisateur).
    try {
      await adminClient()
        .from('google_oauth_state')
        .update({ last_sync_error: err.message?.slice(0, 500) || 'Erreur inconnue' })
        .eq('id', 1)
    } catch { /* best-effort */ }
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
