// Styles partagés de l'éditeur de compte rendu.
export const NAVY = '#0071E3'

export const SUIVI_STYLE = {
  fait: { color: '#1E7B34', bg: '#EAF8EE', border: '#BFE9CA' },
  en_cours: { color: '#0066CC', bg: '#EAF3FF', border: '#C6DDF7' },
  relance: { color: '#D70015', bg: '#FFF0EF', border: '#FFC9C6' },
  nouveau: { color: '#8944AB', bg: '#F7F0FC', border: '#E7D4F5' },
}

export const PRIO_COLOR = { Urgent: '#D70015', 'En cours': '#0066CC', 'En attente': '#6E6E73' }

export const field = {
  padding: '8px 10px', minHeight: 40, border: '1.5px solid #E5E5EA', borderRadius: 8,
  fontSize: 15, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', width: '100%', color: '#1C1C1E',
}

export const card = {
  background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E5E5EA',
}

export const label = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#6E6E73', marginBottom: 4,
}

export const ghostBtn = (color = NAVY) => ({
  background: '#fff', border: `1.5px solid ${color}33`, color, borderRadius: 8, padding: '7px 12px',
  minHeight: 36, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})
