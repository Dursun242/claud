'use client'
import { useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

// Throttle module-level partagé entre ProjectsV et OrdresServiceV. Avant,
// chaque page déclenchait son propre sync au mount → deux appels Odoo
// rapprochés (chacun avec un timeout 30 s côté Odoo) dès qu'un utilisateur
// naviguait entre les deux onglets.
//
// Durée : 2 min. En dessous : on skippe. L'utilisateur peut forcer un
// sync manuel via le bouton "🔄 Signatures" de OrdresServiceV.
const SYNC_TTL_MS = 2 * 60 * 1000
let lastSyncAt = 0
let inFlight = null

/**
 * useSignaturesSync — sync Odoo→Supabase partagé, throttlé 2 min.
 *
 * @returns {{ sync: (opts?: { force?: boolean, silent?: boolean }) => Promise<number|null>, syncing: React.MutableRefObject<boolean> }}
 *          - sync() renvoie le nombre de signatures mises à jour, ou null
 *            si la requête a été skippée par le throttle ou a échoué.
 */
export function useSignaturesSync() {
  const syncingRef = useRef(false)

  const sync = useCallback(async ({ force = false, silent = false } = {}) => {
    const now = Date.now()
    // Coalescence : si un sync est déjà en vol, on retourne la même promesse
    // (évite les doublons quand ProjectsV et OrdresServiceV montent quasi
    // simultanément — ex. navigation rapide).
    if (inFlight) return inFlight
    // Throttle : sauf --force, on n'appelle Odoo que si le dernier sync
    // date de plus de SYNC_TTL_MS.
    if (!force && (now - lastSyncAt) < SYNC_TTL_MS) return null

    syncingRef.current = true
    inFlight = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/odoo/sync-signatures', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        })
        if (!res.ok) throw new Error(`sync HTTP ${res.status}`)
        const json = await res.json()
        lastSyncAt = Date.now()
        return json.updated ?? 0
      } catch (err) {
        if (!silent) console.warn('[sync-signatures]', err.message)
        return null
      } finally {
        syncingRef.current = false
        inFlight = null
      }
    })()
    return inFlight
  }, [])

  return { sync, syncingRef }
}

/** Invalide le cache : force le prochain sync() à partir en Odoo. */
export function invalidateSignaturesSync() {
  lastSyncAt = 0
}
