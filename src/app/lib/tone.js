// Badges et pastilles de statut : texte d'une teinte foncée de la couleur sur
// un fond très dilué de la même couleur (règle « Tinted Badge » de
// DESIGN.md). La teinte foncée garde un contraste d'au moins 4,5:1 sur le
// fond teinté, même en 11 px ; une couleur inconnue est gardée telle quelle.
// Couleurs système iOS (et anciennes couleurs, encore présentes sur
// quelques pages, pour qu'elles restent lisibles).

const TEXT = {
  // bleu
  '#007AFF': '#0062CC', '#0071E3': '#0062CC', '#3B82F6': '#0062CC', '#2563EB': '#0062CC',
  // violet / indigo
  '#AF52DE': '#8944AB', '#8B5CF6': '#8944AB', '#7C3AED': '#8944AB', '#C38BEA': '#8944AB', '#A78BFA': '#8944AB',
  '#5856D6': '#4744B8',
  // vert
  '#34C759': '#1E7B34', '#248A3D': '#1E7B34', '#10B981': '#1E7B34', '#059669': '#1E7B34',
  // orange
  '#FF9500': '#C93400', '#C93400': '#A0390C', '#F59E0B': '#C93400', '#D97706': '#C93400',
  // rouge
  '#FF3B30': '#D70015', '#D70015': '#B0000F', '#EF4444': '#D70015', '#DC2626': '#D70015',
  // sarcelle, rose
  '#30B0C7': '#0F6E7E', '#FF2D55': '#C9002B',
  // gris
  '#8E8E93': '#48484A', '#6E6E73': '#48484A', '#D1D1D6': '#48484A',
  '#94A3B8': '#48484A', '#64748B': '#48484A', '#CBD5E1': '#48484A',
}

/** Teinte de texte lisible pour une couleur de statut (#RRGGBB). */
export function toneText(color) {
  const key = String(color || '').toUpperCase()
  return TEXT[key] || color
}

/** Fond très dilué (≈ 9 %) d'une couleur #RRGGBB. */
export function toneBg(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? `${color}18` : '#F2F2F7'
}
