'use client'
// useSaveTask — enregistre une tâche (statut coché, etc.) avec mise à jour
// ciblée du cache ; sans réseau, la modification est appliquée à l'écran et
// mise en file d'attente (envoyée au retour de la connexion).

import { useCallback } from 'react'
import { SB } from '../dashboards/shared'
import { useAuth } from '../auth'
import { usePatchDashboardTask } from './useDashboardData'
import { enqueue, isNetworkError } from '../lib/offlineStore'

/**
 * @returns {(task: object, reload: () => any) => Promise<'saved'|'queued'>}
 *   Lève l'erreur d'origine si ce n'est pas un problème de réseau.
 */
export function useSaveTask() {
  const { user } = useAuth()
  const patchTask = usePatchDashboardTask()
  return useCallback(async (task, reload) => {
    try {
      const saved = await SB.upsertTask(task)
      if (!patchTask(saved)) await reload?.()
      return 'saved'
    } catch (err) {
      const local = { ...task, chantier_id: task.chantier_id ?? task.chantierId ?? null }
      if (user?.email && task.id && isNetworkError(err) && patchTask(local)) {
        enqueue(user.email, { type: 'task', payload: task, dedupeKey: `task:${task.id}` })
        return 'queued'
      }
      throw err
    }
  }, [user?.email, patchTask])
}
