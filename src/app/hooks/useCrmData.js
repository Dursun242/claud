'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadCrm } from '../lib/crmDb'

export const CRM_KEY = ['crm', 'all']

const EMPTY = { opportunites: [], interactions: [], devis: [], devisEvents: [], missingMigration: false, devisMissing: false }

/**
 * useCrmData — charge opportunités + interactions via React Query.
 *
 * Chargé à la demande (premier affichage de l'onglet CRM), pas au cold
 * start : le pipeline commercial n'est pas nécessaire au dashboard.
 * Cache 5 min comme useDashboardData ; `reload()` invalide la query.
 *
 * `patch(fn)` met à jour le cache localement (fn reçoit { opportunites,
 * interactions, … } et renvoie la nouvelle version) sans recharger les
 * tables : utilisé après une écriture dont on connaît le résultat. La
 * query est marquée périmée pour être relue au prochain montage.
 */
export function useCrmData({ enabled = true } = {}) {
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: CRM_KEY,
    queryFn: () => loadCrm(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CRM_KEY }),
    [queryClient],
  )
  const patch = useCallback((fn) => {
    queryClient.setQueryData(CRM_KEY, (old) => (old ? fn(old) : old))
    queryClient.invalidateQueries({ queryKey: CRM_KEY, refetchType: 'none' })
  }, [queryClient])
  return {
    crm: q.data || EMPTY,
    loading: q.isLoading,
    // CRM chargé (ou en échec) — faux tant que la requête n'a pas abouti,
    // y compris quand elle n'est pas encore lancée (enabled: false).
    ready: q.status !== 'pending',
    error: q.error || null,
    reload,
    patch,
  }
}
