'use client'
import { useState, useRef, useEffect } from 'react'
import { inp } from '../dashboards/shared'

/**
 * AddressPicker — champ d'adresse avec autocomplétion.
 *
 * Source : Base Adresse Nationale (api-adresse.data.gouv.fr), API publique
 * de l'État, gratuite, sans clé, CORS ouvert : appelée directement depuis
 * le navigateur (aucun secret à protéger, pas besoin de passer par /api/*).
 *
 * Reste un <input> libre : on peut taper une adresse hors base (lieu-dit,
 * adresse étrangère) et l'enregistrer telle quelle.
 *
 * Props :
 *   value, onChange(text)      : le texte du champ (contrôlé)
 *   onSelect({ label, rue, code_postal, ville, lat, lon })
 *                              : appelé quand une suggestion est choisie
 *                                (le parent remplit ses champs CP / ville…)
 *   fullLabel                  : true = onChange reçoit « rue, CP ville »
 *                                (défaut) ; false = seulement la rue.
 *   placeholder, style, inputProps
 */
const BAN_URL = 'https://api-adresse.data.gouv.fr/search/'
const MIN_CHARS = 3
const DEBOUNCE_MS = 250

// Cache mémoire des requêtes (même session) : évite de re-taper le réseau
// quand on efface / retape les mêmes lettres.
const cache = new Map()

export async function searchAddresses(q, signal) {
  const key = q.trim().toLowerCase()
  if (cache.has(key)) return cache.get(key)
  const url = `${BAN_URL}?q=${encodeURIComponent(q.trim())}&limit=6&autocomplete=1`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`BAN ${res.status}`)
  const json = await res.json()
  const list = (json.features || []).map(f => {
    const p = f.properties || {}
    return {
      id: p.id || p.label,
      label: p.label,
      rue: p.type === 'municipality' ? '' : (p.name || ''),
      code_postal: p.postcode || '',
      ville: p.city || '',
      contexte: p.context || '',
      lat: f.geometry?.coordinates?.[1] ?? null,
      lon: f.geometry?.coordinates?.[0] ?? null,
    }
  })
  cache.set(key, list)
  return list
}

export default function AddressPicker({
  value = '', onChange, onSelect, fullLabel = true,
  placeholder = 'Tape une adresse…', style, inputProps = {},
}) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const boxRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const listId = useRef(`address-picker-${Math.random().toString(36).slice(2, 8)}`)
  // Après une sélection, on ne relance pas la recherche sur la valeur choisie
  const skipNextRef = useRef(false)

  useEffect(() => {
    if (skipNextRef.current) { skipNextRef.current = false; return }
    const q = (value || '').trim()
    clearTimeout(timerRef.current)
    abortRef.current?.abort()
    if (q.length < MIN_CHARS) { setItems([]); setLoading(false); return }
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      try {
        const list = await searchAddresses(q, ctrl.signal)
        if (!ctrl.signal.aborted) { setItems(list); setActive(0); setFailed(false); setOpen(true) }
      } catch (e) {
        if (e?.name !== 'AbortError') { setItems([]); setFailed(true) }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timerRef.current)
  }, [value])

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = (a) => {
    skipNextRef.current = true
    onChange?.(fullLabel ? a.label : (a.rue || a.label))
    onSelect?.(a)
    setOpen(false); setItems([])
  }

  const onKey = (e) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input value={value || ''} role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list"
        aria-controls={listId.current} autoComplete="off"
        onChange={e => onChange?.(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true) }} onKeyDown={onKey}
        placeholder={placeholder} style={{ ...inp, paddingRight: 30, ...style }} {...inputProps} />
      <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: 12, fontSize: 14, opacity: 0.5 }}>
        {loading ? '…' : '📍'}
      </span>
      {open && items.length > 0 && (
        <div role="listbox" id={listId.current} style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {items.map((a, i) => (
            <button key={a.id} type="button" role="option" aria-selected={active === i}
              onMouseEnter={() => setActive(i)} onClick={() => pick(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
                background: active === i ? '#F1F5F9' : '#fff',
              }}>
              <div style={{ fontWeight: 600, color: '#0F172A' }}>{a.rue || a.ville}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{a.code_postal} {a.ville}{a.contexte ? ` · ${a.contexte}` : ''}</div>
            </button>
          ))}
          <div style={{ padding: '4px 12px', fontSize: 9, color: '#94A3B8', borderTop: '1px solid #F1F5F9' }}>Base Adresse Nationale</div>
        </div>
      )}
      {failed && (value || '').trim().length >= MIN_CHARS && (
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>Suggestions indisponibles — tu peux saisir l&apos;adresse librement.</div>
      )}
    </div>
  )
}
