'use client'
// useSaveTask — enregistre une tâche (statut coché, etc.) avec mise à jour
// ciblée du cache ; sans réseau, la modification est appliquée à l'écran et
// mise en file d'attente (envoyée au retour de la connexion).

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SB } from '../dashboards/shared'
import { useAuth } from '../auth'
import { DASHBOARD_KEYS, usePatchDashboardTask } from './useDashboardData'
import { enqueue, isNetworkError } from '../lib/offlineStore'

/**
 * @returns {(task: object, reload: () => any) => Promise<'saved'|'queued'>}
 *   Lève l'erreur d'origine si ce n'est pas un problème de réseau, ou
 *   l'erreur de la file si la modification n'a pas pu être gardée sur
 *   l'appareil (rien n'est alors modifié à l'écran).
 */
export function useSaveTask() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const patchTask = usePatchDashboardTask()
  return useCallback(async (task, reload) => {
    try {
      const saved = await SB.upsertTask(task)
      if (!patchTask(saved)) await reload?.()
      return 'saved'
    } catch (err) {
      const inCache = !!task.id && !!queryClient.getQueryData(DASHBOARD_KEYS.critical)?.tasks?.some(t => t.id === task.id)
      if (user?.email && inCache && isNetworkError(err)) {
        // Mise en file d'abord : si elle échoue (lève), l'écran n'est pas modifié
        enqueue(user.email, { type: 'task', payload: task, dedupeKey: `task:${task.id}` })
        patchTask({ ...task, chantier_id: task.chantier_id ?? task.chantierId ?? null })
        return 'queued'
      }
      throw err
    }
  }, [user?.email, queryClient, patchTask])
}
