// Badges et pastilles de statut : texte d'une teinte foncée de la couleur sur
// un fond très dilué de la même couleur (règle « Tinted Badge » de
// DESIGN.md). La teinte foncée garde un contraste d'au moins 4,5:1 sur le
// fond teinté, même en 11 px ; une couleur inconnue est gardée telle quelle.

const TEXT = {
  '#3B82F6': '#1D4ED8', // bleu signal → bleu lien profond
  '#2563EB': '#1D4ED8',
  '#8B5CF6': '#6D28D9', // violet planifié
  '#7C3AED': '#6D28D9',
  '#A78BFA': '#6D28D9', // lavande Qonto
  '#10B981': '#047857', // succès
  '#059669': '#047857',
  '#F59E0B': '#B45309', // attention
  '#D97706': '#B45309',
  '#EF4444': '#B91C1C', // danger
  '#DC2626': '#B91C1C',
  '#94A3B8': '#475569', // neutres
  '#64748B': '#475569',
  '#CBD5E1': '#475569',
}

/** Teinte de texte lisible pour une couleur de statut (#RRGGBB). */
export function toneText(color) {
  const key = String(color || '').toUpperCase()
  return TEXT[key] || color
}

/** Fond très dilué (≈ 9 %) d'une couleur #RRGGBB. */
export function toneBg(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? `${color}18` : '#F1F5F9'
}
