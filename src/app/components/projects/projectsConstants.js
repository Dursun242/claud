// Listes canoniques utilisées pour les pills de filtre et le formulaire
// de création/édition de chantier.
export const PROJECT_STATUSES = ['Planifié', 'En cours', 'En attente', 'Terminé']
export const PROJECT_PHASES   = ['Avant-projet', 'Études', 'Gros œuvre', "Hors d'air", 'Technique', 'Finitions']

// Style pill (actif / inactif) — partagé entre filtre statut et filtre phase.
export const pillStyle = (active, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 11px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  border: `1px solid ${active ? color : '#E2E8F0'}`,
  background: active ? color : '#fff',
  color: active ? '#fff' : '#334155',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background .15s, color .15s, border-color .15s',
  whiteSpace: 'nowrap',
})

export const pillDot = (active, color) => ({
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: active ? '#fff' : color,
  opacity: active ? 0.8 : 1,
})
