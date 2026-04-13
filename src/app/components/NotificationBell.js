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
  const { items, unreadCount, markAsRead, markAllRead } = useNotifications(userEmail)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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
        aria-label="Notifications"
        title="Notifications"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 8,
          color: '#334155',
          fontSize: 20,
          lineHeight: 1,
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: '#DC2626',
            color: '#fff',
            borderRadius: 999,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            fontSize: 9,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
            boxSizing: 'content-box',
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
              Notifications{unreadCount > 0 ? ` (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})` : ''}
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
              <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.5 }}>🔔</div>
              Aucune notification
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
