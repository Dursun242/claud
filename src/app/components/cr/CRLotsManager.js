'use client'
import { useState } from 'react'
import { field } from './crStyles'

const iconBtn = {
  width: 30, height: 30, borderRadius: 6, border: '1px solid var(--separator)', background: '#fff',
  color: 'var(--label-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0,
}

/**
 * Gestion des lots du compte rendu : monter, descendre, renommer, supprimer
 * (Généralités reste en tête). L'ordre est celui du PDF.
 * `onRename(key, nom)` renvoie un message d'erreur ou null.
 */
export default function CRLotsManager({ lots = [], counts = {}, onMove, onRename, onRemove }) {
  const [editing, setEditing] = useState(null) // { key, value, error }
  const save = () => {
    const err = onRename(editing.key, editing.value)
    if (err) setEditing({ ...editing, error: err })
    else setEditing(null)
  }
  return (
    <ul aria-label="Lots du compte rendu" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lots.map((l, i) => {
        const n = counts[l.key]?.total || 0
        if (editing?.key === l.key) {
          return (
            <li key={l.key}>
              <form onSubmit={(e) => { e.preventDefault(); save() }} style={{ display: 'flex', gap: 4 }}>
                <input autoFocus value={editing.value} aria-label={`Nouveau nom du lot ${l.lot}`}
                  onChange={e => setEditing({ ...editing, value: e.target.value, error: null })}
                  style={{ ...field, minHeight: 32, fontSize: 13, padding: '4px 8px' }} />
                <button type="submit" aria-label="Valider le nom" style={{ ...iconBtn, color: 'var(--green-text)' }}>✓</button>
                <button type="button" aria-label="Annuler" onClick={() => setEditing(null)} style={iconBtn}>✕</button>
              </form>
              {editing.error && <div role="alert" style={{ fontSize: 11, color: 'var(--red-text)', marginTop: 2 }}>{editing.error}</div>}
            </li>
          )
        }
        return (
          <li key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l.lot}{n ? <span style={{ color: 'var(--label-secondary)' }}> · {n}</span> : null}
            </span>
            <button type="button" aria-label={`Monter ${l.lot}`} disabled={i === 0} onClick={() => onMove(l.key, -1)} style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
            <button type="button" aria-label={`Descendre ${l.lot}`} disabled={i === lots.length - 1} onClick={() => onMove(l.key, 1)} style={{ ...iconBtn, opacity: i === lots.length - 1 ? 0.35 : 1 }}>↓</button>
            <button type="button" aria-label={`Renommer ${l.lot}`} onClick={() => setEditing({ key: l.key, value: l.lot, error: null })} style={iconBtn}>✎</button>
            <button type="button" aria-label={`Supprimer ${l.lot}`} onClick={() => onRemove(l)} style={{ ...iconBtn, color: 'var(--red-text)' }}>🗑</button>
          </li>
        )
      })}
    </ul>
  )
}
