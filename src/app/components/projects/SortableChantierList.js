'use client'
import { useRef, useState } from 'react'
import ChantierCard from './ChantierCard'

const EMPTY_COUNTS = { os: 0, cr: 0, tasks: 0, attachments: 0 }
const arrowBtn = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--separator)', background: '#fff',
  color: 'var(--label-2)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
}

/**
 * Liste des chantiers. Rangement à la main (`sortable`) : poignée ⠿ à faire
 * glisser (souris ou doigt), flèches haut / bas au clavier, boutons ↑ ↓ sur
 * téléphone. `onMove(from, to)` reçoit les positions dans la liste affichée.
 */
export default function SortableChantierList({ chantiers = [], countsByChantier, m, readOnly, sortable, onMove, onOpen, onEdit, onDelete }) {
  const [drag, setDrag] = useState(null) // { id, over } pendant le glisser
  const rowEls = useRef(new Map())
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
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ id, over: ids.indexOf(id) })
  }
  const onPointerMove = (e) => {
    if (!drag) return
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
    <div style={{ display: 'grid', gap: 12 }}>
      {chantiers.map((ch, idx) => {
        const dragging = drag?.id === ch.id
        const before = drag && drag.over === idx && !dragging
        const after = drag && idx === ids.length - 1 && drag.over === ids.length && !dragging
        return (
          <div key={ch.id} data-testid="chantier-row" ref={el => { if (el) rowEls.current.set(ch.id, el); else rowEls.current.delete(ch.id) }}
            style={{
              display: 'flex', alignItems: 'stretch', gap: sortable ? 6 : 0, opacity: dragging ? 0.5 : 1, borderRadius: 12,
              boxShadow: before ? '0 -3px 0 var(--system-blue)' : after ? '0 3px 0 var(--system-blue)' : 'none',
            }}>
            {sortable && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}>
                <span role="button" tabIndex={0} aria-label={`Déplacer ${ch.nom || 'ce chantier'} (flèches haut et bas)`} title="Glisser pour changer l’ordre"
                  onPointerDown={(e) => onDown(e, ch.id)} onPointerMove={onPointerMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); onMove?.(idx, idx - 1) }
                    if (e.key === 'ArrowDown' && idx < ids.length - 1) { e.preventDefault(); onMove?.(idx, idx + 1) }
                  }}
                  style={{ cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', color: 'var(--label-tertiary)', fontSize: 20, lineHeight: 1, padding: '10px 4px' }}>⠿</span>
                {m && (
                  <>
                    <button type="button" aria-label={`Monter ${ch.nom || 'ce chantier'}`} disabled={idx === 0} onClick={() => onMove?.(idx, idx - 1)} style={{ ...arrowBtn, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                    <button type="button" aria-label={`Descendre ${ch.nom || 'ce chantier'}`} disabled={idx === ids.length - 1} onClick={() => onMove?.(idx, idx + 1)} style={{ ...arrowBtn, opacity: idx === ids.length - 1 ? 0.4 : 1 }}>↓</button>
                  </>
                )}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <ChantierCard ch={ch} counts={countsByChantier.get(ch.id) || EMPTY_COUNTS} m={m} readOnly={readOnly}
                onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
