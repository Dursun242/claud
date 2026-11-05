'use client'

// Pastille de filtre (statut, phase) : blanche au repos, avec un point de la
// couleur du statut seulement quand la couleur a un sens (pas pour « Tous »
// ni les phases), bleue quand elle est choisie (une seule couleur
// d'action). 32 px de haut, 44 px au doigt (.u-btn).

export default function FilterPill({ active, color = null, label, count, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="u-btn"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
        minHeight: 32, padding: '0 12px', borderRadius: 8,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--separator)'}`,
        background: active ? 'var(--accent)' : '#fff', color: active ? '#fff' : 'var(--label)',
        fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
      {color && <span aria-hidden="true" style={{
        width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : color,
      }} />}
      {label}
      {count !== undefined && (
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: active ? 'rgba(255,255,255,0.8)' : 'var(--label-tertiary)' }}>{count}</span>
      )}
    </button>
  )
}

// Rangée de pastilles : une ligne qui défile au téléphone, retour à la ligne
// à l'ordinateur.
export const pillRow = (m) => ({
  display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center',
  flexWrap: m ? 'nowrap' : 'wrap', overflowX: m ? 'auto' : 'visible',
  padding: m ? '6px 0' : 0, WebkitOverflowScrolling: 'touch',
})
