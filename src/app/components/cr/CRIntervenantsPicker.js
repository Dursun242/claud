'use client'
import { useRef, useState } from 'react'
import { toCrIntervenant } from '../../lib/crSuivi'

const PRESENCES = [
  { v: 'Présent', short: 'P', color: '#1E7B34', bg: '#EAF8EE' },
  { v: 'Absent', short: 'A', color: '#D70015', bg: '#FFF0EF' },
  { v: 'Excusé', short: 'E', color: '#C93400', bg: '#FFF7E8' },
]

const uniq = (arr) => [...new Set(arr.filter(Boolean))]
const arrowBtn = {
  width: 30, height: 30, borderRadius: 6, border: '1px solid var(--separator)', background: '#fff',
  color: 'var(--label-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
}

const linkBtn = (color) => ({
  background: 'none', border: 'none', color, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
})

/**
 * Intervenants du CR : case « concerné », présence à la réunion
 * (Présent / Absent / Excusé) et convocation à la prochaine réunion.
 * `available` = intervenants du chantier (lib/crSuivi.chantierIntervenants),
 * `value` = entrées enregistrées dans le CR (toCrIntervenant).
 * L'ordre se change en faisant glisser la poignée ⠿ (souris ou doigt) ou
 * avec les flèches : c'est l'ordre des intervenants dans le PDF. Les
 * intervenants cochés viennent d'abord, dans l'ordre enregistré.
 */
export default function CRIntervenantsPicker({ available = [], value = [], onChange, m }) {
  const [custom, setCustom] = useState(null)        // ordre choisi à la main
  const [drag, setDrag] = useState(null)             // { nom, over } pendant le glisser
  const rowEls = useRef(new Map())

  // Intervenants du chantier + ceux déjà dans le CR (ex. repris du CR
  // précédent). Ordre : les cochés dans l'ordre du CR, puis les autres.
  const byNom = new Map(value.map(v => [v.nom, v]))
  const itemByNom = new Map(value.map(v => [v.nom, v]))
  for (const a of available) itemByNom.set(a.nom, a)
  const defaults = uniq([...value.map(v => v.nom), ...available.map(a => a.nom)])
  const names = custom ? uniq([...custom.filter(n => itemByNom.has(n)), ...defaults]) : defaults
  const list = names.map(n => itemByNom.get(n))

  if (!list.length) {
    return (
      <div style={{ background: 'var(--row-fill)', border: '1px dashed var(--separator-opaque)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--label-secondary)' }}>
        Aucun intervenant sur ce chantier — ajoutez-en depuis sa fiche (onglet Chantiers), puis revenez ici.
      </div>
    )
  }

  const set = (next) => onChange(list.map(it => next.get(it.nom)).filter(Boolean))
  // Déplace un intervenant : nouvel ordre à l'écran et dans le CR
  const move = (from, to) => {
    if (to < 0 || to >= names.length || from === to) return
    const arr = [...names]
    const [x] = arr.splice(from, 1)
    arr.splice(to, 0, x)
    setCustom(arr)
    onChange(arr.map(n => byNom.get(n)).filter(Boolean))
  }
  // Glisser-déposer à la souris ou au doigt (poignée ⠿)
  const overIndex = (y) => {
    let i = 0
    for (const n of names) {
      const el = rowEls.current.get(n)
      if (!el) { i += 1; continue }
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) return i
      i += 1
    }
    return names.length
  }
  const onHandleDown = (e, nom) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ nom, over: names.indexOf(nom) })
  }
  const onHandleMove = (e) => {
    if (!drag) return
    const over = overIndex(e.clientY)
    if (over !== drag.over) setDrag({ ...drag, over })
  }
  const onHandleUp = () => {
    if (!drag) return
    const from = names.indexOf(drag.nom)
    const to = drag.over > from ? drag.over - 1 : drag.over
    setDrag(null)
    move(from, to)
  }
  const toggle = (it) => {
    const next = new Map(byNom)
    if (next.has(it.nom)) next.delete(it.nom)
    else next.set(it.nom, toCrIntervenant(it))
    set(next)
  }
  const patch = (it, p) => {
    const next = new Map(byNom)
    next.set(it.nom, { ...next.get(it.nom), ...p })
    set(next)
  }
  const convoques = value.filter(v => v.convoque !== false).length

  return (
    <div style={{ background: 'var(--row-fill)', border: '1px solid var(--separator)', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--label)' }}>
          {value.length === 0 ? 'Aucun sélectionné' : `${value.length} intervenant${value.length > 1 ? 's' : ''} · ${convoques} convoqué${convoques > 1 ? 's' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" style={linkBtn('#0066CC')}
            onClick={() => set(new Map(list.map(it => [it.nom, byNom.get(it.nom) || toCrIntervenant(it)])))}>Tout cocher</button>
          <button type="button" style={linkBtn('#6E6E73')} onClick={() => onChange([])}>Tout décocher</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((it, idx) => {
          const cur = byNom.get(it.nom)
          const isSel = !!cur
          const dragging = drag?.nom === it.nom
          const dropBefore = drag && drag.over === idx && !dragging
          const dropAfter = drag && idx === list.length - 1 && drag.over === list.length && !dragging
          return (
            <div key={it.id || it.nom} data-testid="cr-intervenant" ref={el => { if (el) rowEls.current.set(it.nom, el); else rowEls.current.delete(it.nom) }} style={{
              opacity: dragging ? 0.5 : 1,
              boxShadow: dropBefore ? '0 -3px 0 var(--system-blue)' : dropAfter ? '0 3px 0 var(--system-blue)' : 'none',
              display: 'flex', alignItems: m ? 'stretch' : 'center', flexDirection: m ? 'column' : 'row', gap: 8,
              padding: '8px 10px', borderRadius: 6, background: isSel ? 'var(--accent-tint)' : '#fff',
              border: isSel ? '1.5px solid var(--system-blue)' : '1px solid var(--separator)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span role="button" tabIndex={0} aria-label={`Déplacer ${it.nom} (flèches haut et bas)`} title="Glisser pour changer l’ordre"
                onPointerDown={(e) => onHandleDown(e, it.nom)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(idx, idx - 1) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(idx, idx + 1) }
                }}
                style={{ cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', color: 'var(--label-tertiary)', fontSize: 18, lineHeight: 1, padding: '6px 2px', flexShrink: 0 }}>⠿</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(it)}
                  style={{ width: 18, height: 18, accentColor: 'var(--system-blue)', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)' }}>{it.nom}</span>
                  {(it.societe && it.societe !== it.nom) || it.role ? (
                    <span style={{ fontSize: 11, color: 'var(--label-secondary)' }}>
                      {' '}· {[it.societe && it.societe !== it.nom ? it.societe : '', it.role].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  {!it.email && <span style={{ fontSize: 11, color: 'var(--orange-text)' }}> · sans email</span>}
                </span>
              </label>
              {m && (
                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button type="button" aria-label={`Monter ${it.nom}`} disabled={idx === 0} onClick={() => move(idx, idx - 1)} style={{ ...arrowBtn, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                  <button type="button" aria-label={`Descendre ${it.nom}`} disabled={idx === list.length - 1} onClick={() => move(idx, idx + 1)} style={{ ...arrowBtn, opacity: idx === list.length - 1 ? 0.4 : 1 }}>↓</button>
                </span>
              )}
              </div>
              {isSel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div role="radiogroup" aria-label={`Présence de ${it.nom}`} style={{ display: 'flex', gap: 3 }}>
                    {PRESENCES.map(p => {
                      const on = (cur.presence || 'Présent') === p.v
                      return (
                        <button key={p.v} type="button" role="radio" aria-checked={on} title={p.v}
                          onClick={() => patch(it, { presence: p.v })}
                          style={{
                            minWidth: 30, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'inherit', border: `1.5px solid ${on ? p.color : 'var(--separator)'}`,
                            background: on ? p.bg : '#fff', color: on ? p.color : 'var(--label-secondary)',
                          }}>{m ? p.short : p.v}</button>
                      )
                    })}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--accent-text)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cur.convoque !== false}
                      onChange={e => patch(it, { convoque: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                    Convoqué
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
