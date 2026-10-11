'use client'
import { useRef } from 'react'

// Onglets de la fiche chantier, en contrôle segmenté façon iOS : fond gris,
// segment actif blanc. Flèches gauche / droite pour passer d'un onglet à
// l'autre (motif ARIA « tabs »).

export const CHANTIER_TABS = [
  { id: 'suivi', label: 'Suivi' },
  { id: 'entreprises', label: 'Entreprises' },
  { id: 'documents', label: 'Documents' },
  { id: 'finances', label: 'Finances' },
]

export default function ChantierTabs({ value, onChange, tabs = CHANTIER_TABS }) {
  const refs = useRef({})
  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t.id === value)
    let next = null
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length]
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length]
    else if (e.key === 'Home') next = tabs[0]
    else if (e.key === 'End') next = tabs[tabs.length - 1]
    if (!next) return
    e.preventDefault()
    onChange(next.id)
    refs.current[next.id]?.focus()
  }
  return (
    <div role="tablist" aria-label="Rubriques du chantier" onKeyDown={onKeyDown} style={{
      display: 'flex', overflowX: 'auto',
      background: '#E9E9EB', borderRadius: 10, padding: 2, gap: 2, marginBottom: 20,
    }}>
      {tabs.map(t => {
        const active = t.id === value
        return (
          <button key={t.id} type="button" role="tab" id={`chantier-tab-${t.id}`}
            aria-selected={active} aria-controls={`chantier-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            ref={el => { refs.current[t.id] = el }}
            onClick={() => onChange(t.id)}
            className="u-hit"
            style={{
              flex: '1 1 0', minWidth: 'max-content', minHeight: 36, padding: '6px 8px', border: 'none', borderRadius: 8,
              background: active ? '#fff' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)' : 'none',
              color: 'var(--label)', fontSize: 'clamp(13px, 3.6vw, 14px)', fontWeight: active ? 600 : 500,
              fontFamily: 'inherit', cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
