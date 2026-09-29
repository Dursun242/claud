// Mises à jour ciblées de listes en cache (React Query) : remplacer une
// ligne par id, en ajouter une en tête, en retirer une. Pur, sans état.

/** Remplace la ligne de même id, ou l'ajoute en tête si absente. */
export function upsertById(list, row) {
  const arr = Array.isArray(list) ? list : []
  if (!row?.id) return arr
  const i = arr.findIndex(x => x?.id === row.id)
  if (i < 0) return [row, ...arr]
  const next = arr.slice()
  next[i] = { ...arr[i], ...row }
  return next
}

/** Retire la ligne d'id donné. */
export function removeById(list, id) {
  const arr = Array.isArray(list) ? list : []
  return arr.filter(x => x?.id !== id)
}

/** Applique `fn` à la ligne d'id donné (patch partiel). */
export function patchById(list, id, fn) {
  const arr = Array.isArray(list) ? list : []
  return arr.map(x => (x?.id === id ? { ...x, ...fn(x) } : x))
}
