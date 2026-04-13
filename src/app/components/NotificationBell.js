'use client'
import { useState, useEffect, useRef } from 'react'
import { useNotifications } from '../hooks/useNotifications'

function relativeTime(iso) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const s = Math.floor(diff / 1000)
  if (s < 60)   return `il y a ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60)   return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)   return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7)    return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

const ICONS = {
  chantier:   '🏗️',
  os:         '📋',
  cr:         '📝',
  task:       '✓',
  attachment: '📎',
  comment:    '💬',
}

/**
 * Cloche de notifications avec badge + panneau déroulant.
 *
 * @param {Object} props
 * @param {string} props.userEmail
 * @param {Function} props.onNavigate — (tab, notif) → naviguer vers la ressource
 */
export default function NotificationBell({ userEmail, onNavigate }) {
  const { items, unreadCount, markAsRead, markAllRead, newItemSignal } = useNotifications(userEmail)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const autoOpenedRef = useRef(false)

  // Auto-ouverture au premier chargement (même si la liste est vide → on
  // affichera "Rien de nouveau pour le moment")
  useEffect(() => {
    if (!userEmail || autoOpenedRef.current) return
    autoOpenedRef.current = true
    // Petit délai pour laisser l'UI se monter proprement avant d'afficher
    const t = setTimeout(() => setOpen(true), 400)
    return () => clearTimeout(t)
  }, [userEmail])

  // Auto-ouverture à chaque nouvelle activité reçue en temps réel
  useEffect(() => {
    if (newItemSignal > 0) setOpen(true)
  }, [newItemSignal])

  // Ferme le panneau au clic extérieur
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleClick = async (n) => {
    setOpen(false)
    if (!n.read_at) markAsRead(n.id)
    if (onNavigate && n.target_tab) {
      onNavigate(n.target_tab, n)
    }
  }

  const badge = unreadCount > 99 ? '99+' : unreadCount

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Activité récente"
        title="Activité récente"
        style={{
          position: 'relative',
          background: open ? '#F1F5F9' : '#fff',
          border: '1px solid #E2E8F0',
          cursor: 'pointer',
          width: 36, height: 36,
          borderRadius: 10,
          color: unreadCount > 0 ? '#3B82F6' : '#334155',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          transition: 'background .15s, border-color .15s, color .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? '#F1F5F9' : '#fff'; e.currentTarget.style.borderColor = '#E2E8F0' }}
      >
        {/* Icône "activity" (ligne de pouls / ECG) — plus moderne qu'une cloche */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#DC2626',
            color: '#fff',
            borderRadius: 999,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            fontSize: 10,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
            boxSizing: 'content-box',
            lineHeight: 1,
          }}>{badge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          width: 340,
          maxWidth: '90vw',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 10px 40px rgba(15,23,42,0.12)',
          zIndex: 5000,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
              Activité récente{unreadCount > 0 ? ` · ${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''}` : ''}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#3B82F6',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: 0,
                  fontFamily: 'inherit',
                }}
              >Tout marquer lu</button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }} aria-hidden="true">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <div>Rien de nouveau pour le moment</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 400, overflowY: 'auto' }}>
              {items.map((n) => {
                const unread = !n.read_at
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: unread ? '#EFF6FF' : '#fff',
                        border: 'none',
                        borderBottom: '1px solid #F1F5F9',
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = unread ? '#DBEAFE' : '#F8FAFC' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = unread ? '#EFF6FF' : '#fff' }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                        {ICONS[n.entity_type] || '•'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: unread ? 700 : 500,
                          color: '#0F172A',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>{n.title}</div>
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                          {relativeTime(n.created_at)}
                        </div>
                      </div>
                      {unread && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#3B82F6', flexShrink: 0, marginTop: 6,
                        }}/>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
