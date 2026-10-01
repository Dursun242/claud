// Styles partagés de l'éditeur de compte rendu.
export const NAVY = '#1E3A5F'

export const SUIVI_STYLE = {
  fait: { color: '#047857', bg: '#ECFDF5', border: '#6EE7B7' },
  en_cours: { color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
  relance: { color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
  nouveau: { color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD' },
}

export const PRIO_COLOR = { Urgent: '#B91C1C', 'En cours': '#1D4ED8', 'En attente': '#64748B' }

export const field = {
  padding: '8px 10px', minHeight: 40, border: '1.5px solid #E2E8F0', borderRadius: 8,
  fontSize: 15, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', width: '100%', color: '#0F172A',
}

export const card = {
  background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E2E8F0',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
}

export const label = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 4,
}

export const ghostBtn = (color = NAVY) => ({
  background: '#fff', border: `1.5px solid ${color}33`, color, borderRadius: 8, padding: '7px 12px',
  minHeight: 36, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
})
