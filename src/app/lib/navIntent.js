// Intention de navigation « créer » transmise via focusId.
//
// Convention : switchTab(tab, 'new') ouvre directement le formulaire de
// création de la page cible ; switchTab(tab, 'new:<chantierId>') le
// pré-remplit avec ce chantier. Utilisé par les actions rapides du
// dashboard et le bouton « + » de la barre mobile.

export const NEW_INTENT = 'new'

export const newIntent = (chantierId = '') => (chantierId ? `new:${chantierId}` : NEW_INTENT)

// → null si focusId n'est pas une intention de création,
//   sinon { chantierId } (chaîne vide si non précisé).
export function parseNewIntent(focusId) {
  if (typeof focusId !== 'string') return null
  if (focusId === NEW_INTENT) return { chantierId: '' }
  if (focusId.startsWith('new:')) return { chantierId: focusId.slice(4) }
  return null
}
