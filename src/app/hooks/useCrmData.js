'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadCrm } from '../lib/crmDb'

export const CRM_KEY = ['crm', 'all']

const EMPTY = { opportunites: [], interactions: [], devis: [], missingMigration: false, devisMissing: false }

/**
 * useCrmData — charge opportunités + interactions via React Query.
 *
 * Chargé à la demande (premier affichage de l'onglet CRM), pas au cold
 * start : le pipeline commercial n'est pas nécessaire au dashboard.
 * Cache 5 min comme useDashboardData ; `reload()` invalide la query.
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
  return {
    crm: q.data || EMPTY,
    loading: q.isLoading,
    error: q.error || null,
    reload,
  }
}
