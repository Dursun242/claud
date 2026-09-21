'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { inp } from '../dashboards/shared'

/**
 * ContactPicker — champ de sélection d'un contact avec recherche.
 *
 * Remplace un <select> de 200 lignes : on tape « dup », on voit Dupont,
 * SCI Dupont, Dupuis… et on clique. Le contact choisi s'affiche en
 * pastille avec une croix pour le retirer.
 *
 * Props :
 *   contacts   : liste des contacts (data.contacts)
 *   value      : id du contact sélectionné (ou '')
 *   onChange   : (id | '') => void
 *   onCreate   : (nom) => Promise<contact>  — optionnel : propose « Créer « nom » »
 *   placeholder
 */
export default function ContactPicker({ contacts = [], value, onChange, onCreate, placeholder = 'Rechercher un contact…' }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useRef(`contact-picker-${Math.random().toString(36).slice(2, 8)}`)

  const selected = useMemo(() => contacts.find(c => c.id === value) || null, [contacts, value])

  const results = useMemo(() => {
    const s = q.toLowerCase().trim()
    const list = s
      ? contacts.filter(c =>
          (c.nom || '').toLowerCase().includes(s) ||
          (c.societe || '').toLowerCase().includes(s) ||
          (c.ville || '').toLowerCase().includes(s) ||
          (c.email || '').toLowerCase().includes(s))
      : contacts
    // Clients et MOA d'abord (ce sont eux qu'on rattache à une affaire)
    const rank = (c) => (c.type === 'Client' || c.type === 'MOA') ? 0 : 1
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.nom || '').localeCompare(b.nom || '')).slice(0, 8)
  }, [contacts, q])

  const canCreate = !!onCreate && q.trim().length >= 2
    && !contacts.some(c => (c.nom || '').toLowerCase() === q.trim().toLowerCase())
  const items = canCreate ? [...results, { _create: true }] : results

  useEffect(() => { setActive(0) }, [q])

  // Fermer au clic extérieur
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const pick = async (item) => {
    if (item?._create) {
      setCreating(true)
      try {
        const c = await onCreate(q.trim())
        if (c?.id) onChange(c.id)
      } finally { setCreating(false) }
    } else if (item) {
      onChange(item.id)
    }
    setQ(''); setOpen(false)
  }

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...inp, padding: '6px 8px 6px 12px', background: '#F8FAFC' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
          <strong style={{ color: '#0F172A' }}>{selected.nom}</strong>
          {selected.societe && <span style={{ color: '#64748B' }}> · {selected.societe}</span>}
          {selected.type && <span style={{ color: '#94A3B8', fontSize: 11 }}> · {selected.type}</span>}
        </div>
        <button type="button" onClick={() => { onChange(''); setTimeout(() => inputRef.current?.focus(), 0) }}
          aria-label="Retirer le contact" title="Changer de contact"
          style={{ background: '#E2E8F0', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#475569', flexShrink: 0 }}>✕</button>
      </div>
    )
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input ref={inputRef} value={q} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={listId.current}
        aria-label="Rechercher un contact"
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder={placeholder} style={{ ...inp, paddingLeft: 34 }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12, fontSize: 15, opacity: 0.6 }}>🔍</span>
      {open && (
        <div role="listbox" id={listId.current} style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {items.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94A3B8' }}>
              {contacts.length === 0 ? 'Aucun contact dans l’annuaire.' : 'Aucun contact ne correspond.'}
            </div>
          )}
          {items.map((c, i) => c._create ? (
            <button key="__create" type="button" role="option" aria-selected={active === i}
              onMouseEnter={() => setActive(i)} onClick={() => pick(c)} disabled={creating}
              style={{ ...row, background: active === i ? '#EFF6FF' : '#fff', color: '#1D4ED8', fontWeight: 600, borderTop: '1px solid #F1F5F9' }}>
              {creating ? 'Création…' : `+ Créer le contact « ${q.trim()} »`}
            </button>
          ) : (
            <button key={c.id} type="button" role="option" aria-selected={active === i}
              onMouseEnter={() => setActive(i)} onClick={() => pick(c)}
              style={{ ...row, background: active === i ? '#F1F5F9' : '#fff' }}>
              <span style={{ fontWeight: 600, color: '#0F172A' }}>{c.nom}</span>
              {c.societe && <span style={{ color: '#64748B' }}> · {c.societe}</span>}
              <span style={{ float: 'right', fontSize: 10, color: '#94A3B8' }}>{c.type}{c.ville ? ` · ${c.ville}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const row = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: 13,
  border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
}
