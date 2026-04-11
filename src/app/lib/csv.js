/**
 * Export CSV — utilitaires pour générer et télécharger des CSV côté client.
 *
 * - Gère l'échappement (guillemets, virgules, retours à la ligne)
 * - BOM UTF-8 en tête pour qu'Excel français ouvre les caractères
 *   accentués correctement (sans BOM, Excel affiche "é" comme "Ã©")
 * - Séparateur = point-virgule : convention Excel FR (locale fr-FR
 *   utilise la virgule comme séparateur décimal, donc le CSV standard
 *   à virgules casse les montants)
 */

/** Échappe une valeur pour l'inclure dans une cellule CSV. */
function escapeCell(value) {
  if (value == null) return ''
  const str = String(value)
  // Si la valeur contient un séparateur, un guillemet ou un saut de ligne,
  // on l'entoure de guillemets et on double les guillemets internes.
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Construit le contenu CSV à partir d'un tableau d'objets.
 * @param {Array<Object>} rows   - données
 * @param {Array<{key, label, get?}>} columns - définition des colonnes :
 *                                  key = clé dans l'objet,
 *                                  label = entête,
 *                                  get = (row) => value (optionnel, prioritaire sur key)
 * @returns {string} contenu CSV (séparateur ; + retour CRLF)
 */
export function buildCSV(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(';')
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.get ? c.get(row) : row[c.key]
      return escapeCell(v)
    }).join(';')
  ).join('\r\n')
  // BOM UTF-8 + contenu
  return '\uFEFF' + header + '\r\n' + body
}

/**
 * Déclenche le téléchargement d'un CSV dans le navigateur.
 */
export function downloadCSV(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Libère la mémoire du Blob
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Helper pour formater une date ISO en "DD/MM/YYYY" pour Excel FR.
 */
export function formatDateFR(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d)) return String(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch {
    return String(iso)
  }
}

/**
 * Helper pour formater un montant en "1234,56" (virgule décimale FR)
 * sans unité ni espace (pour rester numérique dans Excel).
 */
export function formatMoneyFR(n) {
  const num = Number(n) || 0
  return num.toFixed(2).replace('.', ',')
}
