// anthropicError.js — traduit une erreur de l'API Anthropic en message
// compréhensible pour l'utilisateur + code HTTP à renvoyer au navigateur.
//
// Avant, toutes les erreurs devenaient « Erreur du service IA » : impossible
// de distinguer une image refusée, un crédit épuisé, une clé invalide ou une
// surcharge. Le détail brut reste dans les logs serveur.

function parse(bodyText) {
  try {
    const j = JSON.parse(bodyText || '')
    return { type: j?.error?.type || '', message: String(j?.error?.message || '') }
  } catch {
    return { type: '', message: String(bodyText || '') }
  }
}

/**
 * @param {number} status   code HTTP renvoyé par Anthropic
 * @param {string} bodyText corps de la réponse (JSON d'erreur Anthropic)
 * @returns {{ message: string, status: number }}
 */
export function describeAnthropicError(status, bodyText) {
  const { type, message } = parse(bodyText)
  const msg = message.toLowerCase()

  if (/credit balance|billing|purchase credits/.test(msg)) {
    return { status: 502, message: 'Crédit de l’API IA épuisé : rechargez le compte Anthropic (console.anthropic.com → Billing).' }
  }
  if (status === 401 || type === 'authentication_error') {
    return { status: 502, message: 'Clé API IA invalide ou révoquée (configuration serveur ANTHROPIC_API_KEY).' }
  }
  if (status === 403 || type === 'permission_error') {
    return { status: 502, message: 'Accès refusé par l’API IA (clé sans droit sur ce modèle).' }
  }
  if (status === 404 || type === 'not_found_error') {
    return { status: 502, message: 'Modèle IA introuvable (configuration serveur).' }
  }
  if (status === 413 || type === 'request_too_large') {
    return { status: 413, message: 'Image trop volumineuse pour l’IA : recadrez-la ou prenez une capture plus petite.' }
  }
  if (status === 429 || type === 'rate_limit_error') {
    return { status: 429, message: 'Trop de demandes à l’IA en ce moment : réessayez dans une minute.' }
  }
  if (status === 529 || type === 'overloaded_error' || status >= 500) {
    return { status: 503, message: 'Service IA momentanément surchargé : réessayez dans quelques instants.' }
  }
  if (/image/.test(msg)) {
    return { status: 422, message: 'Image refusée par l’IA (trop grande, format ou contenu illisible). Essayez une photo recadrée ou une capture plus courte.' }
  }
  return { status: 502, message: `Erreur du service IA (code ${status}).` }
}
