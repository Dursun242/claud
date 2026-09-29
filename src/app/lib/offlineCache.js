// offlineCache.js — sauvegarde / restauration du cache React Query dans
// IndexedDB, pour consulter les données sans réseau (chantier, sous-sol).
//
// Seules les données métier sont concernées (clés 'dashboard' et 'crm').
// Restauration : uniquement pour les requêtes encore vides (des données
// fraîches déjà chargées ne sont jamais écrasées par l'ancienne copie).

import { cacheGet, cacheSet } from './offlineStore'

const PERSIST_ROOTS = new Set(['dashboard', 'crm'])
const shouldPersist = (key) => Array.isArray(key) && PERSIST_ROOTS.has(key[0])
const storeKey = (email) => `queries:${String(email || '').toLowerCase().trim()}`

/** Restaure les données sauvegardées. Retourne la date de sauvegarde, ou null. */
export async function restoreQueries(queryClient, email) {
  const saved = await cacheGet(storeKey(email))
  if (!saved?.entries?.length) return null
  let restored = 0
  for (const { key, data, updatedAt } of saved.entries) {
    if (queryClient.getQueryData(key) !== undefined) continue
    queryClient.setQueryData(key, data, { updatedAt })
    restored++
  }
  return restored ? saved.savedAt : null
}

/** Sauvegarde (regroupée) après chaque chargement réussi. Retourne l'arrêt. */
export function persistQueries(queryClient, email, { delay = 2000 } = {}) {
  let timer = null
  const save = () => {
    const entries = queryClient.getQueryCache().getAll()
      .filter(q => shouldPersist(q.queryKey) && q.state.status === 'success' && q.state.data !== undefined)
      .map(q => ({ key: q.queryKey, data: q.state.data, updatedAt: q.state.dataUpdatedAt }))
    if (entries.length) cacheSet(storeKey(email), { savedAt: Date.now(), entries })
  }
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.type !== 'updated' || event.action?.type !== 'success') return
    if (!shouldPersist(event.query?.queryKey)) return
    clearTimeout(timer)
    timer = setTimeout(save, delay)
  })
  return () => { clearTimeout(timer); unsubscribe() }
}
