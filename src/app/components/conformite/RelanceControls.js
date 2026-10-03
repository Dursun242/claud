'use client'
import { useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { conformitePost } from '../../hooks/useConformite'

const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const DUREES = [
  ['7', '1 semaine'], ['30', '1 mois'], ['90', '3 mois'], ['0', 'sans limite'],
]

/**
 * Suspendre / reprendre les relances automatiques d'une entreprise.
 * `pause` : lib/conformite.relancePause(contact, today).
 */
export default function RelanceControls({ contact, pause, onChanged, compact = false }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const set = async (paused, until) => {
    setBusy(true)
    try {
      await conformitePost({ action: 'pause', contactId: contact.id, paused, until })
      addToast(paused ? `Relances suspendues${until ? ` jusqu’au ${fmtD(until)}` : ''} : ${contact.nom}` : `Relances reprises : ${contact.nom}`, 'success')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') } finally { setBusy(false) }
  }
  const font = { fontSize: compact ? 10 : 11, fontFamily: 'inherit' }
  if (pause) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', ...font }}>
        {!compact && <span style={{ color: '#B45309', fontWeight: 600 }}>⏸ Relances suspendues{pause.jusquau ? ` jusqu’au ${fmtD(pause.jusquau)}` : ''}</span>}
        <button type="button" onClick={() => set(false)} disabled={busy}
          style={{ ...font, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', borderRadius: 6, padding: '3px 8px', fontWeight: 700, cursor: 'pointer' }}>
          ▶ Reprendre
        </button>
      </span>
    )
  }
  return (
    <select aria-label={`Suspendre les relances de ${contact.nom}`} value="" disabled={busy}
      onChange={(e) => { const v = e.target.value; if (v !== '') set(true, v === '0' ? null : addDays(Number(v))) }}
      style={{ ...font, border: '1px solid #CBD5E1', borderRadius: 6, padding: '3px 6px', background: '#fff', color: '#334155', cursor: 'pointer' }}>
      <option value="">⏸ Suspendre…</option>
      {DUREES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
