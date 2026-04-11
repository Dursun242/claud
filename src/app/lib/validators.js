/**
 * Validateurs de format — helpers réutilisables pour les formulaires.
 *
 * Tous les validateurs retournent un objet { valid, message } :
 * - valid  : true si le format est correct OU si l'entrée est vide
 *            (les champs optionnels ne doivent pas bloquer la saisie)
 * - message: chaîne d'explication si invalide, "" sinon
 *
 * Utilisés côté client pour afficher une erreur avant l'envoi,
 * et ne remplacent pas la validation côté serveur/DB.
 *
 * Les messages NE commencent PAS par le nom du champ (SIRET, IBAN…)
 * car le caller est censé préfixer avec le label du formulaire.
 * Ça évite les doublons type « SIRET : SIRET invalide ».
 */

// ─── SIRET ─────────────────────────────────────────────────────
// 14 chiffres, validation par l'algorithme de Luhn.
// Accepte les espaces dans la saisie.
//
// Règle Luhn : on double les chiffres aux positions IMPAIRES en
// partant de la DROITE (0-indexed). Pour un nombre à 14 chiffres
// numéroté de gauche à droite en 0-indexed, ça correspond aux
// positions PAIRES (0, 2, 4, 6, 8, 10, 12).
//
// ⚠️ L'implémentation précédente utilisait `i % 2 === 1` (positions
//    impaires de gauche) ce qui doublait les mauvais chiffres →
//    faux négatifs sur des SIRET pourtant valides. Corrigé ici.
//
// Exception : les SIRET de La Poste (SIREN 356000000) ne passent
// pas le Luhn standard (règle spéciale INSEE). On les accepte tels quels.
export function validateSiret(value) {
  if (!value) return { valid: true, message: '' }
  const clean = String(value).replace(/\s/g, '')
  if (!/^\d{14}$/.test(clean)) {
    return { valid: false, message: 'format invalide (14 chiffres attendus).' }
  }
  // Exception La Poste
  if (clean.startsWith('356000000')) return { valid: true, message: '' }
  // Luhn correct : doubler les positions paires en partant de la gauche
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let n = parseInt(clean[i], 10)
    if (i % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  if (sum % 10 !== 0) {
    return { valid: false, message: 'clé de contrôle invalide (possible typo).' }
  }
  return { valid: true, message: '' }
}

// ─── TÉLÉPHONE FR ──────────────────────────────────────────────
// Accepte : 06 12 34 56 78, 0612345678, +33 6 12 34 56 78, +33612345678
// On ne bloque pas les formats étrangers mais on valide au moins un
// format français courant quand ça commence par 0 ou +33.
export function validatePhoneFR(value) {
  if (!value) return { valid: true, message: '' }
  const clean = String(value).replace(/[\s.\-()]/g, '')
  // Format français strict : 0X XX XX XX XX ou +33X XX XX XX XX
  if (/^(?:\+33|0)[1-9]\d{8}$/.test(clean)) return { valid: true, message: '' }
  // Autre format international : on laisse passer si ça commence par +
  if (/^\+\d{8,15}$/.test(clean)) return { valid: true, message: '' }
  return { valid: false, message: 'format invalide (ex: 06 12 34 56 78).' }
}

// ─── EMAIL ─────────────────────────────────────────────────────
// Validation basique (pas la RFC complète — overkill)
export function validateEmail(value) {
  if (!value) return { valid: true, message: '' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return { valid: false, message: 'format invalide.' }
  }
  return { valid: true, message: '' }
}

// ─── IBAN ──────────────────────────────────────────────────────
// Validation IBAN via l'algorithme MOD-97 (standard ISO 13616).
// Accepte les espaces et majuscules/minuscules.
// Pays : on accepte tout IBAN conforme, pas juste FR.
export function validateIban(value) {
  if (!value) return { valid: true, message: '' }
  const clean = String(value).replace(/\s/g, '').toUpperCase()
  // Format général : 2 lettres (pays) + 2 chiffres (contrôle) + 11-30 caractères
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) {
    return { valid: false, message: 'format invalide.' }
  }
  // MOD-97 : on déplace les 4 premiers caractères à la fin,
  // on convertit les lettres en nombres (A=10..Z=35), puis mod 97 doit = 1
  const rearranged = clean.slice(4) + clean.slice(0, 4)
  const numeric = rearranged
    .split('')
    .map((c) => (c >= '0' && c <= '9' ? c : (c.charCodeAt(0) - 55).toString()))
    .join('')
  // BigInt pour gérer les grands nombres sans perte
  try {
    if (BigInt(numeric) % 97n !== 1n) {
      return { valid: false, message: 'clé de contrôle invalide.' }
    }
  } catch {
    return { valid: false, message: 'contenu invalide.' }
  }
  return { valid: true, message: '' }
}

// ─── CODE POSTAL FR ────────────────────────────────────────────
export function validateCodePostalFR(value) {
  if (!value) return { valid: true, message: '' }
  if (!/^\d{5}$/.test(String(value).trim())) {
    return { valid: false, message: 'format invalide (5 chiffres attendus).' }
  }
  return { valid: true, message: '' }
}

// ─── TVA intracommunautaire ────────────────────────────────────
// Format général : 2 lettres pays + 2-13 caractères alphanumériques
export function validateTvaIntra(value) {
  if (!value) return { valid: true, message: '' }
  const clean = String(value).replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(clean)) {
    return { valid: false, message: 'format invalide (ex: FR12345678901).' }
  }
  return { valid: true, message: '' }
}
