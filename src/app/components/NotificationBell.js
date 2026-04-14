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
  const [hovering, setHovering] = useState(false)
  const ref = useRef(null)
  const autoOpenedRef = useRef(false)
  const closeTimerRef = useRef(null)

  // Fermeture automatique : 3s après ouverture si pas d'interaction.
  // Le timer se réinitialise au survol → tant que l'user regarde, ça reste.
  const AUTO_CLOSE_MS = 3000
  const armCloseTimer = () => {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS)
  }
  const cancelCloseTimer = () => clearTimeout(closeTimerRef.current)

  useEffect(() => {
    if (open && !hovering) armCloseTimer()
    else cancelCloseTimer()
    return cancelCloseTimer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hovering])

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
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 320,
            maxWidth: '92vw',
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: '0 24px 60px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.7)',
            zIndex: 5000,
            overflow: 'hidden',
            animation: 'fadeInDown .22s cubic-bezier(.2,.9,.3,1.2)',
          }}>
          <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
          {/* Auto-close progress bar (subtle) */}
          {!hovering && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(59,130,246,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
                animation: `shrinkLeft ${AUTO_CLOSE_MS}ms linear forwards`,
                transformOrigin: 'left',
              }}/>
              <style>{`@keyframes shrinkLeft{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
            </div>
          )}

          <div style={{
            padding: '12px 14px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                Activité
              </span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#3B82F6',
                  background: 'rgba(59,130,246,0.12)',
                  padding: '2px 7px', borderRadius: 999, lineHeight: 1.4,
                }}>{unreadCount} nouveau{unreadCount > 1 ? 'x' : ''}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#3B82F6',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 6px',
                  borderRadius: 5,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >Tout lu</button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '24px 16px 28px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6, opacity: 0.7 }} aria-hidden="true">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <div style={{ fontWeight: 600, color: '#64748B', fontSize: 12 }}>Tout est calme</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: '2px 6px 8px', maxHeight: 420, overflowY: 'auto' }}>
              {items.map((n) => {
                const unread = !n.read_at
                return (
                  <li key={n.id} style={{ marginBottom: 2 }}>
                    <button
                      onClick={() => handleClick(n)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: unread ? 'rgba(59,130,246,0.08)' : 'transparent',
                        border: 'none',
                        borderRadius: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontFamily: 'inherit',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = unread ? 'rgba(59,130,246,0.14)' : 'rgba(15,23,42,0.04)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = unread ? 'rgba(59,130,246,0.08)' : 'transparent' }}
                    >
                      <span style={{
                        fontSize: 15, lineHeight: 1, flexShrink: 0,
                        width: 28, height: 28,
                        borderRadius: 8,
                        background: unread ? 'rgba(59,130,246,0.15)' : 'rgba(15,23,42,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {ICONS[n.entity_type] || '•'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: unread ? 600 : 500,
                          color: '#0F172A',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>{n.title}</div>
                        {n.body && (
                          <div style={{
                            fontSize: 10,
                            color: '#64748B',
                            marginTop: 3,
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>{n.body}</div>
                        )}
                        <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 4, fontWeight: 500, letterSpacing: '0.02em' }}>
                          {relativeTime(n.created_at)}
                        </div>
                      </div>
                      {unread && (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#3B82F6', flexShrink: 0, marginTop: 12,
                          boxShadow: '0 0 0 3px rgba(59,130,246,0.2)',
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
