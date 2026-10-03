'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SB } from '../dashboards/shared'

// Query key paramétrée par l'id du compte (auth.users) : chaque MOA a son
// propre cache, y compris le cache hors ligne (préfixe 'dashboard').
export const clientDataKey = (userId) => ['dashboard', 'client', userId || '']

const EMPTY = Object.freeze({
  chantiers: [], contacts: [], tasks: [],
  planning: [], rdv: [], compteRendus: [], ordresService: [],
})

/**
 * useClientDashboardData — équivalent de useDashboardData pour les MOA.
 * Un seul appel `SB.loadForClient(userId)` (pas de split critical/
 * secondary vu que la vue client est déjà plus légère).
 *
 * @param {string} userId - Id du compte connecté (chantiers.client_user_id)
 * @returns {{ data: object, loading: boolean, reload: () => Promise<void> }}
 */
export function useClientDashboardData(userId) {
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: clientDataKey(userId),
    queryFn: () => SB.loadForClient(userId),
    // Pas de compte connecté : pas de fetch.
    enabled: !!userId,
  })

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: clientDataKey(userId) })
  }, [queryClient, userId])

  // Toujours renvoyer un objet non-null : simplifie le consumer (pas besoin
  // de gérer le null explicitement dans ClientDashboard, le skeleton est
  // piloté par `loading` uniquement).
  return {
    data: q.data || EMPTY,
    loading: q.isLoading,
    reload,
  }
}
