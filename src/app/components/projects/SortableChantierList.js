'use client'
import { useRef, useState } from 'react'
import ChantierCard from './ChantierCard'

const EMPTY_COUNTS = { os: 0, cr: 0, tasks: 0, attachments: 0 }
const EDGE = 80 // bord de l'écran (px) où la page défile pendant le glisser

/**
 * Liste des chantiers (cartes), ou mode « Ranger » (`ranging`) : liste
 * compacte où chaque chantier se déplace en faisant glisser sa poignée ⠿
 * à droite (souris ou doigt, la page défile près des bords), ou au clavier
 * avec les flèches. `onMove(from, to)` reçoit les positions dans la liste.
 */
export default function SortableChantierList({ chantiers = [], countsByChantier, m, readOnly, ranging, onMove, onOpen, onEdit, onDelete }) {
  const [drag, setDrag] = useState(null) // { id, over } pendant le glisser
  const rowEls = useRef(new Map())

  if (!ranging) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {chantiers.map(ch => (
          <ChantierCard key={ch.id} ch={ch} counts={countsByChantier.get(ch.id) || EMPTY_COUNTS} m={m} readOnly={readOnly}
            onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    )
  }

  const ids = chantiers.map(c => c.id)
  const overIndex = (y) => {
    let i = 0
    for (const id of ids) {
      const el = rowEls.current.get(id)
      if (el) {
        const r = el.getBoundingClientRect()
        if (y < r.top + r.height / 2) return i
      }
      i += 1
    }
    return ids.length
  }
  const onDown = (e, id) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ id, over: ids.indexOf(id) })
  }
  const onPointerMove = (e) => {
    if (!drag) return
    if (typeof window !== 'undefined') {
      if (e.clientY < EDGE) window.scrollBy?.(0, -12)
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy?.(0, 12)
    }
    const over = overIndex(e.clientY)
    if (over !== drag.over) setDrag({ ...drag, over })
  }
  const onUp = () => {
    if (!drag) return
    const from = ids.indexOf(drag.id)
    const to = drag.over > from ? drag.over - 1 : drag.over
    setDrag(null)
    if (to !== from) onMove?.(from, to)
  }

  return (
    <div role="list" aria-label="Ordre des chantiers" style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--separator)', overflow: 'hidden' }}>
      {chantiers.map((ch, idx) => {
        const dragging = drag?.id === ch.id
        const before = drag && drag.over === idx && !dragging
        const after = drag && idx === ids.length - 1 && drag.over === ids.length && !dragging
        return (
          <div key={ch.id} role="listitem" data-testid="chantier-row" ref={el => { if (el) rowEls.current.set(ch.id, el); else rowEls.current.delete(ch.id) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 6px 16px', minHeight: 56,
              borderTop: idx ? '1px solid var(--separator)' : 'none',
              background: dragging ? 'var(--accent-tint)' : '#fff',
              boxShadow: before ? 'inset 0 3px 0 var(--system-blue)' : after ? 'inset 0 -3px 0 var(--system-blue)' : 'none',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: ch.nom ? 'var(--label)' : 'var(--label-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ch.nom || 'Chantier sans nom'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--label-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[ch.client, ch.statut].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span role="button" tabIndex={0} aria-label={`Déplacer ${ch.nom || 'ce chantier'} (flèches haut et bas)`} title="Glisser pour changer l’ordre"
              onPointerDown={(e) => onDown(e, ch.id)} onPointerMove={onPointerMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); onMove?.(idx, idx - 1) }
                if (e.key === 'ArrowDown' && idx < ids.length - 1) { e.preventDefault(); onMove?.(idx, idx + 1) }
              }}
              style={{
                width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', color: 'var(--label-tertiary)', fontSize: 22,
              }}>≡</span>
          </div>
        )
      })}
    </div>
  )
}
