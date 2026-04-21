'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SB } from '../dashboards/shared'

// Query key paramétrée par prénom/nom : deux clients différents partagent
// leur cache si jamais ils se connectaient au même moment côté DevTools
// (en prod, chaque MOA a son propre browser / storage).
export const clientDataKey = (prenom, nom) => ['dashboard', 'client', prenom || '', nom || '']

const EMPTY = Object.freeze({
  chantiers: [], contacts: [], tasks: [],
  planning: [], rdv: [], compteRendus: [], ordresService: [],
})

/**
 * useClientDashboardData — équivalent de useDashboardData pour les MOA.
 * Un seul appel `SB.loadForClient(prenom, nom)` (pas de split critical/
 * secondary vu que la vue client est déjà plus légère).
 *
 * @param {string} prenom - Prénom du client (utilisé dans le matching)
 * @param {string} [nom] - Nom (non utilisé côté code mais passé pour compat)
 * @returns {{ data: object, loading: boolean, reload: () => Promise<void> }}
 */
export function useClientDashboardData(prenom, nom) {
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: clientDataKey(prenom, nom),
    queryFn: () => SB.loadForClient(prenom, nom),
    // Si pas de prénom, pas de fetch (cas d'un profil incomplet).
    enabled: !!prenom,
  })

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: clientDataKey(prenom, nom) })
  }, [queryClient, prenom, nom])

  // Toujours renvoyer un objet non-null : simplifie le consumer (pas besoin
  // de gérer le null explicitement dans ClientDashboard, le skeleton est
  // piloté par `loading` uniquement).
  return {
    data: q.data || EMPTY,
    loading: q.isLoading,
    reload,
  }
}
