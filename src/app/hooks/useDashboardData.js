'use client'
import { useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SB, defaultData } from '../dashboards/shared'

// ─── Query keys ───
// Exposées pour que les mutations puissent invalider ciblé
// (ex. après une création OS → invalidate DASHBOARD_KEYS.critical).
export const DASHBOARD_KEYS = {
  critical:  ['dashboard', 'admin', 'critical'],
  secondary: ['dashboard', 'admin', 'secondary'],
}

/**
 * useDashboardData — charge les données du dashboard admin via React Query.
 *
 * Stratégie :
 *   - Stage 1 (critical) : chantiers + tasks + OS + CR → débloque le rendu.
 *   - Stage 2 (secondary) : contacts + planning + rdv + counts PJ → hydrate
 *     en arrière-plan.
 *
 * Gains vs l'ancien useEffect :
 *   - Cache staleTime 5 min : revenir sur le dashboard après une navigation
 *     rapide ne refetch pas (navigation instantanée).
 *   - Dédup : deux composants qui appellent le hook partagent la query.
 *   - refetchOnReconnect : les données sont rafraîchies dès que le réseau
 *     revient après une coupure.
 *
 * @returns {{ data: object|null, loading: boolean, error: Error|null,
 *             reload: () => Promise<void>, hasChantiers: boolean|null }}
 */
export function useDashboardData() {
  const queryClient = useQueryClient()

  const criticalQ = useQuery({
    queryKey: DASHBOARD_KEYS.critical,
    queryFn: async () => {
      const res = await SB.loadCritical()
      if (res?.error) throw new Error(res.error)
      return res
    },
  })

  const secondaryQ = useQuery({
    queryKey: DASHBOARD_KEYS.secondary,
    queryFn: () => SB.loadSecondary(),
    // Ne lance secondary qu'une fois critical chargé : on connaît alors
    // les demoIds et on évite un 2e cold-start simultané sur le réseau.
    enabled: !!criticalQ.data,
  })

  // Merge critical + secondary en un seul objet `data` (shape identique à
  // SB.loadAll historique — les pages consomment `data.chantiers`, etc.).
  const data = useMemo(() => {
    if (!criticalQ.data) return null
    const { _demoIds = new Set(), ...critical } = criticalQ.data
    const notDemo = (item) => !item?.chantier_id || !_demoIds.has(item.chantier_id)
    const sec = secondaryQ.data || {}
    return {
      ...defaultData,
      ...critical,
      contacts:    sec.contacts || [],
      planning:    (sec.planning || []).filter(notDemo),
      rdv:         (sec.rdv || []).filter(notDemo),
      attachmentCountsByChantier: sec.attachmentCountsByChantier || new Map(),
    }
  }, [criticalQ.data, secondaryQ.data])

  // reload = invalide les deux queries. Retourne une promesse qui résout
  // quand les deux refetchs sont terminés (utile pour les mutations qui
  // veulent attendre la fraîcheur avant de fermer une modale, etc.).
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.critical }),
      queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.secondary }),
    ])
  }, [queryClient])

  return {
    data,
    loading: criticalQ.isLoading,
    error: criticalQ.error || null,
    reload,
    // Exposé pour la branche "premier login = pas de chantiers → seed".
    // null tant que la query n'a pas résolu.
    hasChantiers: criticalQ.data ? criticalQ.data.chantiers?.length > 0 : null,
  }
}
