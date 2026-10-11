'use client'

// Pastille de filtre (statut, phase) : blanche au repos avec un point de la
// couleur du statut, bleue quand elle est choisie (une seule couleur
// d'action). 32 px de haut, 44 px au doigt (.u-btn).

export default function FilterPill({ active, color = '#8E8E93', label, count, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="u-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        minHeight: 32, padding: '0 12px', borderRadius: 999,
        border: `1px solid ${active ? '#0071E3' : '#E5E5EA'}`,
        background: active ? '#0071E3' : '#fff', color: active ? '#fff' : '#1C1C1E',
        fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : color,
      }} />
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 500, color: active ? 'rgba(255,255,255,0.85)' : '#6E6E73' }}>{count}</span>
      )}
    </button>
  )
}

// Rangée de pastilles : une ligne qui défile au téléphone, retour à la ligne
// à l'ordinateur.
export const pillRow = (m) => ({
  display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center',
  flexWrap: m ? 'nowrap' : 'wrap', overflowX: m ? 'auto' : 'visible',
  padding: m ? '6px 0' : 0, WebkitOverflowScrolling: 'touch',
})
