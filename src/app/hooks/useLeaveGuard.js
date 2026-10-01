'use client'
import { useEffect } from 'react'
import { holdLeaveGuard } from '../lib/leaveGuard'

/**
 * Protège un travail en cours tant que `active` est vrai : le retour du
 * téléphone, la fermeture ou le rechargement de la page ne font plus perdre
 * la saisie (voir lib/leaveGuard).
 */
export function useLeaveGuard(active) {
  useEffect(() => {
    if (!active) return
    return holdLeaveGuard()
  }, [active])
}
