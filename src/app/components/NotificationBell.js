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
  signature:  '✍️',
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
          top: 'calc(100% + 8px)',
          right: 0,
          width: 380,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #E2E8F0',
          boxShadow: '0 20px 50px rgba(15,23,42,0.15), 0 4px 12px rgba(15,23,42,0.06)',
          zIndex: 5000,
          overflow: 'hidden',
          animation: 'fadeInDown .2s ease',
        }}>
          <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
          <div style={{
            padding: '16px 18px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                Activité récente
              </div>
              {unreadCount > 0 && (
                <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, marginTop: 2 }}>
                  {unreadCount} nouveau{unreadCount > 1 ? 'x' : ''}
                </div>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#1D4ED8',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >Tout marquer lu</button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }} aria-hidden="true">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 3 }}>Tout est calme</div>
              <div style={{ fontSize: 11 }}>Aucune nouvelle activité pour le moment</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 6, maxHeight: 480, overflowY: 'auto' }}>
              {items.map((n, idx) => {
                const unread = !n.read_at
                const isLast = idx === items.length - 1
                return (
                  <li key={n.id} style={{ marginBottom: isLast ? 0 : 2 }}>
                    <button
                      onClick={() => handleClick(n)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: unread ? '#F0F7FF' : '#fff',
                        border: unread ? '1px solid #DBEAFE' : '1px solid transparent',
                        borderRadius: 10,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        fontFamily: 'inherit',
                        transition: 'background .12s, border-color .12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = unread ? '#E0EEFF' : '#F8FAFC' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = unread ? '#F0F7FF' : '#fff' }}
                    >
                      <span style={{
                        fontSize: 18, lineHeight: 1, flexShrink: 0,
                        width: 34, height: 34,
                        borderRadius: 8,
                        background: unread ? '#DBEAFE' : '#F1F5F9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {ICONS[n.entity_type] || '•'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: unread ? 600 : 500,
                          color: '#0F172A',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>{n.title}</div>
                        {n.body && (
                          <div style={{
                            fontSize: 11,
                            color: '#64748B',
                            marginTop: 5,
                            lineHeight: 1.45,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>{n.body}</div>
                        )}
                        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontWeight: 500 }}>
                          {relativeTime(n.created_at)}
                        </div>
                      </div>
                      {unread && (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: '#3B82F6', flexShrink: 0, marginTop: 13,
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
