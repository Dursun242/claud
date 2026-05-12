// POST /api/google-tasks/sync
//
// Synchronisation entrante (Google → ID Maîtrise) + bootstrap initial.
//
// Authentification :
//   - Bearer JWT admin → sync manuelle déclenchée par l'utilisateur
//   - Bearer <GOOGLE_TASKS_CRON_SECRET> → cron 10 min
//
// Algorithme :
//   1) Récupère l'état OAuth (no-op si pas connecté).
//   2) Assure l'existence de la liste Google "ID Maîtrise".
//   3) Bootstrap (1er passage, last_full_sync_at == null) :
//      pousse toutes les taches Supabase qui n'ont pas encore de
//      google_task_id vers Google. Évite les doublons en évitant le 2e
//      bootstrap.
//   4) Pull Google avec updatedMin = last_full_sync_at, showDeleted=true.
//      Pour chaque tâche :
//        - deleted=true → DELETE Supabase si trouvée (par google_task_id)
//        - Sinon, trouvée → UPDATE Supabase avec googleTaskToTachePatch
//        - Sinon, pas trouvée → INSERT nouvelle ligne (chantier_id = null,
//          la tâche vient de Google).
//   5) Met à jour last_full_sync_at + efface last_sync_error.
//
// Conflit : Google fait foi côté pull (last-write-wins simplifié). Le push
// sortant (Phase 2) garde Google à jour de toute édition locale, donc en
// pratique les conflits sont rares.

import { verifyAuth } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import {
  getOAuthState,
  saveOAuthState,
  ensureTasksList,
  listTasks,
  insertTask,
  tacheToGoogleTask,
  googleTaskToTachePatch,
} from '@/app/lib/googleTasks'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('google-tasks/sync')

async function authorized(request) {
  // 1) Tente l'auth admin via JWT.
  const user = await verifyAuth(request)
  if (user) {
    const { data: au } = await adminClient()
      .from('authorized_users')
      .select('role')
      .eq('email', user.email)
      .maybeSingle()
    if (au?.role === 'admin') return { source: 'admin' }
  }
  // 2) Sinon, secret cron.
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.GOOGLE_TASKS_CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { source: 'cron' }
  }
  return null
}

async function bootstrap(listId) {
  // Pousse les taches sans google_task_id vers Google. À ne faire qu'une
  // fois (au 1er passage). Limite à 200 tâches pour éviter une boucle
  // infinie + saturation Google API.
  const sb = adminClient()
  const { data: orphans } = await sb
    .from('taches')
    .select('id, titre, priorite, statut, echeance, lot, chantier_id')
    .is('google_task_id', null)
    .limit(200)
  if (!orphans?.length) return { pushed: 0 }

  // Charge les chantiers une fois pour labelliser.
  const chantierIds = [...new Set(orphans.map(t => t.chantier_id).filter(Boolean))]
  let chantierLabels = {}
  if (chantierIds.length) {
    const { data: chs } = await sb.from('chantiers').select('id, nom').in('id', chantierIds)
    chantierLabels = Object.fromEntries((chs || []).map(c => [c.id, c.nom]))
  }

  let pushed = 0
  for (const t of orphans) {
    const payload = tacheToGoogleTask(t, { chantierLabel: chantierLabels[t.chantier_id] })
    try {
      const created = await insertTask(payload, { listId })
      await sb.from('taches').update({
        google_task_id: created.id,
        google_etag: created.etag,
        synced_at: new Date().toISOString(),
      }).eq('id', t.id)
      pushed++
    } catch (err) {
      log.warn(`bootstrap push tache ${t.id} échoué`, err.message)
    }
  }
  return { pushed }
}

async function pullFromGoogle(listId, since) {
  // Pagination Google : continue jusqu'à nextPageToken absent.
  const sb = adminClient()
  let pageToken = undefined
  const summary = { imported: 0, updated: 0, deleted: 0 }

  do {
    const res = await listTasks({
      listId,
      updatedMin: since,
      showCompleted: true,
      showDeleted: true,
      showHidden: true,
      pageToken,
    })
    const items = res.items || []

    for (const gtask of items) {
      // Tombstones (gtask.deleted === true) : supprime côté Supabase.
      if (gtask.deleted) {
        const { data: existing } = await sb.from('taches').select('id').eq('google_task_id', gtask.id).maybeSingle()
        if (existing?.id) {
          await sb.from('taches').delete().eq('id', existing.id)
          summary.deleted++
        }
        continue
      }

      const patch = googleTaskToTachePatch(gtask)
      const { data: existing } = await sb.from('taches')
        .select('id, chantier_id, priorite, lot')
        .eq('google_task_id', gtask.id)
        .maybeSingle()

      if (existing) {
        // UPDATE — on conserve priorite/lot/chantier_id locaux (lecture
        // seule côté Google), on ne touche QUE titre/statut/echeance.
        await sb.from('taches').update({
          titre: patch.titre,
          statut: patch.statut,
          echeance: patch.echeance,
          google_etag: patch.google_etag,
          synced_at: patch.synced_at,
        }).eq('id', existing.id)
        summary.updated++
      } else {
        // INSERT — nouvelle tâche créée depuis Google. Pas de chantier
        // associé (Google n'a pas cette notion). Statut par défaut.
        await sb.from('taches').insert({
          titre: patch.titre,
          statut: patch.statut,
          echeance: patch.echeance,
          priorite: null,
          lot: null,
          chantier_id: null,
          google_task_id: patch.google_task_id,
          google_etag: patch.google_etag,
          synced_at: patch.synced_at,
        })
        summary.imported++
      }
    }

    pageToken = res.nextPageToken
  } while (pageToken)

  return summary
}

export async function POST(request) {
  try {
    const authResult = await authorized(request)
    if (!authResult) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const state = await getOAuthState()
    if (!state) {
      return Response.json({ ok: true, skipped: 'not-connected' })
    }

    const listId = await ensureTasksList()

    // Bootstrap au 1er passage uniquement.
    let bootstrapSummary = null
    if (!state.last_full_sync_at) {
      bootstrapSummary = await bootstrap(listId)
    }

    // Pull Google avec updatedMin pour ne récupérer que les changements
    // depuis la dernière sync (ou tout au 1er passage).
    const since = state.last_full_sync_at
      ? new Date(state.last_full_sync_at).toISOString()
      : undefined
    const pullSummary = await pullFromGoogle(listId, since)

    const now = new Date().toISOString()
    await saveOAuthState({
      last_full_sync_at: now,
      last_sync_error: null,
    })

    log.info('sync OK', { source: authResult.source, bootstrap: bootstrapSummary, pull: pullSummary })
    return Response.json({
      ok: true,
      source: authResult.source,
      bootstrap: bootstrapSummary,
      pull: pullSummary,
      syncedAt: now,
    })
  } catch (err) {
    log.error('exception', err)
    try {
      await adminClient()
        .from('google_oauth_state')
        .update({ last_sync_error: err.message?.slice(0, 500) || 'Erreur inconnue' })
        .eq('id', 1)
    } catch { /* best-effort */ }
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500 })
  }
}
