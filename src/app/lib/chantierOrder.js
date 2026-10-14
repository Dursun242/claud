// Ordre des chantiers choisi à la main (glisser-déposer dans la liste),
// partagé par toute l'équipe : colonne chantiers.ordre (migration 047).
// Logique pure, testée dans __tests__/chantierOrder.test.js.
//
// Un chantier sans ordre (nouveau, ou avant tout rangement) passe en tête,
// du plus récent au plus ancien ; les autres suivent dans l'ordre choisi.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const created = (c) => String(c?.created_at || '')

/** Chantiers dans l'ordre d'affichage (`ordres` : ordres modifiés localement, id → ordre). */
export function sortChantiers(list = [], ordres = null) {
  const ordreOf = (c) => (ordres?.has(c.id) ? ordres.get(c.id) : num(c.ordre))
  return [...list].sort((a, b) => {
    const oa = ordreOf(a), ob = ordreOf(b)
    if (oa == null && ob == null) return created(b).localeCompare(created(a))
    if (oa == null) return -1
    if (ob == null) return 1
    return oa - ob || created(b).localeCompare(created(a))
  })
}

/** Déplace un élément d'une liste (copie). */
export function moveItem(arr = [], from, to) {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const out = [...arr]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

/** Ordres à enregistrer pour une liste rangée : 1, 2, 3… seulement ceux qui changent. */
export function orderPatches(sorted = [], ordres = null) {
  const out = []
  sorted.forEach((c, i) => {
    const cur = ordres?.has(c.id) ? ordres.get(c.id) : num(c.ordre)
    if (cur !== i + 1) out.push({ id: c.id, ordre: i + 1 })
  })
  return out
}
