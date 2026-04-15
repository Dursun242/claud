'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const CATEGORIES = [
  { key: 'chantiers', label: 'Chantiers',  tab: 'projects',  color: '#3B82F6', icon: '🏗️' },
  { key: 'os',        label: 'OS',          tab: 'os',        color: '#8B5CF6', icon: '📋' },
  { key: 'contacts',  label: 'Contacts',    tab: 'contacts',  color: '#10B981', icon: '👤' },
  { key: 'tasks',     label: 'Tâches',      tab: 'tasks',     color: '#F59E0B', icon: '✓'  },
  { key: 'crs',       label: 'Comptes Rendus', tab: 'reports', color: '#EC4899', icon: '📝' },
]

// Historique des derniers éléments ouverts via la recherche (localStorage)
const RECENTS_KEY = 'idm_search_recents'
const RECENTS_MAX = 5
const loadRecents = () => {
  try {
    if (typeof window === 'undefined') return []
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
const pushRecent = (item) => {
  try {
    if (typeof window === 'undefined') return
    const cur = loadRecents().filter(r => !(r.id === item.id && r.tab === item.tab))
    cur.unshift(item)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(cur.slice(0, RECENTS_MAX)))
  } catch { /* ignore */ }
}

function search(data, query) {
  if (!query || query.length < 2) return {}
  const q = query.toLowerCase().trim()
  return {
    chantiers: (data.chantiers || []).filter(c =>
      c.nom?.toLowerCase().includes(q) ||
      c.client?.toLowerCase().includes(q) ||
      c.adresse?.toLowerCase().includes(q)
    ).slice(0, 4).map(c => ({ id: c.id, primary: c.nom, secondary: `${c.client} — ${c.statut}` })),

    os: (data.ordresService || []).filter(o =>
      o.numero?.toLowerCase().includes(q) ||
      o.artisan_nom?.toLowerCase().includes(q) ||
      o.client_nom?.toLowerCase().includes(q)
    ).slice(0, 4).map(o => ({ id: o.id, primary: o.numero, secondary: `${o.artisan_nom || '—'} · ${o.statut}` })),

    contacts: (data.contacts || []).filter(c =>
      c.nom?.toLowerCase().includes(q) ||
      c.specialite?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.tel?.toLowerCase().includes(q)
    ).slice(0, 4).map(c => ({
      id: c.id, primary: c.nom,
      secondary: `${c.type || ''} · ${c.specialite || c.email || ''}`
    })),

    tasks: (data.tasks || []).filter(t =>
      t.titre?.toLowerCase().includes(q) ||
      t.lot?.toLowerCase().includes(q)
    ).slice(0, 4).map(t => ({ id: t.id, primary: t.titre, secondary: `${t.priorite} · ${t.statut}` })),

    crs: (data.compteRendus || []).filter(c =>
      String(c.numero).includes(q) ||
      c.resume?.toLowerCase().includes(q) ||
      c.participants?.toLowerCase().includes(q)
    ).slice(0, 4).map(c => ({
      id: c.id, primary: `CR n°${c.numero}`,
      secondary: (c.resume || '').slice(0, 60) + '…'
    })),
  }
}

export default function GlobalSearch({ data, onNavigate }) {
  const [query, setQuery]     = useState('')
  const [open, setOpen]       = useState(false)
  const [activeIdx, setActive] = useState(-1)
  const [recents, setRecents] = useState([])
  const inputRef = useRef(null)
  const boxRef   = useRef(null)

  // Charge les derniers éléments ouverts au montage
  useEffect(() => { setRecents(loadRecents()) }, [])

  const results = search(data || {}, query)
  const totalCount = Object.values(results).reduce((s, arr) => s + arr.length, 0)
  // Mode "vide" : la dropdown affiche les récents au lieu des résultats
  const showRecents = open && query.length < 2 && recents.length > 0

  // Fermer si clic extérieur
  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Raccourci clavier Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleNavigate = useCallback((tab, id = null, meta = null) => {
    // Sauve dans les récents si on a des métadonnées (titre + catégorie)
    if (id && meta) {
      pushRecent({ id, tab, primary: meta.primary, secondary: meta.secondary, catKey: meta.catKey })
      setRecents(loadRecents())
    }
    onNavigate(tab, id)
    setOpen(false)
    setQuery('')
  }, [onNavigate])

  // Aplatir les résultats pour navigation clavier
  const flat = CATEGORIES.flatMap(cat =>
    (results[cat.key] || []).map(r => ({ ...r, tab: cat.tab, cat }))
  )

  const handleKey = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && activeIdx >= 0) {
      const f = flat[activeIdx]
      handleNavigate(f.tab, f.id, { primary: f.primary, secondary: f.secondary, catKey: f.cat.key })
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', padding: '8px 8px 4px' }}>
      {/* Barre de recherche */}
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)', opacity: 0.4 }}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="#fff" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          data-global-search-input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Rechercher…  ⌘K"
          aria-label="Recherche globale"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '7px 10px 7px 30px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, color: '#fff', fontSize: 12,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)', background: 'none', border: 'none',
            color: '#94A3B8', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1
          }}>✕</button>
        )}
      </div>

      {/* Dropdown — affiche les récents si la requête est vide, sinon les résultats */}
      {open && (query.length >= 2 || showRecents) && (
        <div style={{
          position: 'absolute', left: 8, right: 8, top: '100%', zIndex: 2000,
          background: '#1E293B', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          maxHeight: 400, overflowY: 'auto', marginTop: 4,
        }}>
          {/* ── Mode récents (query vide) ── */}
          {showRecents && (
            <div>
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94A3B8',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                display:'flex', alignItems:'center', justifyContent:'space-between'
              }}>
                <span>⏱ Récents</span>
                <span style={{
                  fontSize: 9, color:'#475569', fontWeight:500,
                  textTransform:'none', letterSpacing:0
                }}>Tape 2 lettres pour chercher</span>
              </div>
              {recents.map((r) => {
                const cat = CATEGORIES.find(c => c.key === r.catKey) || CATEGORIES[0]
                return (
                  <button key={`${r.tab}-${r.id}`} onClick={() => handleNavigate(r.tab, r.id)}
                    style={{
                      display:'block', width:'100%', textAlign:'left',
                      padding:'7px 14px 7px 22px', background:'transparent',
                      border:'none', cursor:'pointer', fontFamily:'inherit',
                      borderLeft:`3px solid transparent`,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>
                      <span style={{ color: cat.color, marginRight: 6 }}>{cat.icon}</span>
                      {r.primary}
                    </div>
                    <div style={{
                      fontSize: 10, color: '#64748B', marginTop: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{r.secondary}</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Mode résultats ── */}
          {query.length >= 2 && (
            totalCount === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: '#64748B', textAlign: 'center' }}>
                Aucun résultat pour « {query} »
              </div>
            ) : (
              CATEGORIES.map(cat => {
                const items = results[cat.key] || []
                if (items.length === 0) return null
                return (
                  <div key={cat.key}>
                    <div style={{
                      padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                      color: cat.color, letterSpacing: '0.08em', textTransform: 'uppercase'
                    }}>
                      {cat.icon} {cat.label}
                    </div>
                    {items.map((item) => {
                      const globalIdx = flat.findIndex(f => f.id === item.id && f.tab === cat.tab)
                      const isActive = globalIdx === activeIdx
                      return (
                        <button key={item.id}
                          onClick={() => handleNavigate(cat.tab, item.id,
                            { primary: item.primary, secondary: item.secondary, catKey: cat.key })}
                          onMouseEnter={() => setActive(globalIdx)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '7px 14px 7px 22px', background: isActive ? 'rgba(59,130,246,0.2)' : 'transparent',
                            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            borderLeft: isActive ? `3px solid ${cat.color}` : '3px solid transparent',
                          }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>{item.primary}</div>
                          <div style={{
                            fontSize: 10, color: '#64748B', marginTop: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>{item.secondary}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )
          )}
          {query.length >= 2 && totalCount > 0 && (
            <div style={{
              padding: '6px 14px 8px', fontSize: 10, color: '#475569',
              borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4
            }}>
              {totalCount} résultat{totalCount > 1 ? 's' : ''} — ↑↓ naviguer · Entrée sélectionner
            </div>
          )}
        </div>
      )}
    </div>
  )
}
