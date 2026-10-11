// Numéro du prochain ordre de service : « OS-<année>-<n° sur 3 chiffres> ».
// La suite est commune à tous les chantiers (plus grand numéro existant + 1),
// pour que deux OS ne reçoivent jamais le même numéro, qu'on les crée depuis
// la page Ordres de service ou depuis la fiche d'un chantier.

/**
 * @param {Array<{numero?: string}>} ordresService  tous les OS connus
 * @param {Date} [now]
 * @returns {string}
 */
export function nextOsNumero(ordresService, now = new Date()) {
  const nums = (ordresService || []).map(os => {
    const m = String(os?.numero || '').match(/(\d+)$/)
    return m ? parseInt(m[1], 10) : 0
  })
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `OS-${now.getFullYear()}-${String(next).padStart(3, '0')}`
}
