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

const ACCENT = {
  chantier:   '#10B981',
  os:         '#8B5CF6',
  cr:         '#3B82F6',
  task:       '#F59E0B',
  attachment: '#0EA5E9',
  comment:    '#EC4899',
  signature:  '#7C3AED',
}

const TOAST_DURATION_MS = 4500
const MAX_TOASTS = 3

/**
 * Toast individuel en bas droite (slide-in + auto-dismiss + hover pause).
 */
function Toast({ notif, index, total, onDismiss, onClick, isMobile }) {
  const accent = ACCENT[notif.entity_type] || '#3B82F6'
  const icon = ICONS[notif.entity_type] || '•'
  const [hover, setHover] = useState(false)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (hover) { clearTimeout(timerRef.current); return }
    timerRef.current = setTimeout(() => {
      setClosing(true)
      setTimeout(() => onDismiss(notif.id), 220)
    }, TOAST_DURATION_MS)
    return () => clearTimeout(timerRef.current)
  }, [hover, notif.id, onDismiss])

  // Empilement : la plus récente en bas, les plus anciennes au-dessus avec
  // un léger décalage et une opacité réduite (effet "stack")
  const offsetY = (total - 1 - index) * (isMobile ? 6 : 8)
  const scale = 1 - (total - 1 - index) * 0.03

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { setClosing(true); setTimeout(() => { onDismiss(notif.id); onClick?.(notif) }, 180) }}
      style={{
        width: isMobile ? '92vw' : 340,
        maxWidth: 360,
        marginBottom: 8,
        padding: '11px 14px',
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.7)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 12,
        boxShadow: '0 14px 36px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transform: `translateY(${closing ? '20px' : -offsetY + 'px'}) scale(${closing ? 0.95 : scale})`,
        opacity: closing ? 0 : 1,
        transition: 'transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .22s ease',
        animation: 'toastIn .28s cubic-bezier(.2,.9,.3,1.2)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(40px) scale(.95); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
      <span style={{
        fontSize: 14, lineHeight: 1, flexShrink: 0,
        width: 26, height: 26, borderRadius: 7,
        background: accent + '22', color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#0F172A',
          lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{notif.title}</div>
        {notif.body && (
          <div style={{
            fontSize: 10, color: '#64748B', marginTop: 3, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{notif.body}</div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setClosing(true); setTimeout(() => onDismiss(notif.id), 180) }}
        aria-label="Fermer"
        style={{
          background: 'transparent', border: 'none', color: '#94A3B8',
          cursor: 'pointer', padding: 2, fontSize: 14, lineHeight: 1, fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >×</button>
      {!hover && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
          animation: `toastShrink ${TOAST_DURATION_MS}ms linear forwards`,
          transformOrigin: 'left',
        }}/>
      )}
      <style>{`@keyframes toastShrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
    </div>
  )
}

/**
 * Cloche d'activité + toaster en bas droite.
 *
 * Comportement 2026 :
 *   - Bouton activity en topbar avec badge (compteur de non-lues)
 *   - Au clic → panneau dropdown avec les 10 dernières (manuel uniquement)
 *   - À chaque nouvelle activité reçue en Realtime → toast en bas droite
 *     (slide-in, dismiss auto 4.5s, pause au survol, max 3 empilés)
 *   - Plus d'auto-open du panneau (moins intrusif)
 */
export default function NotificationBell({ userEmail, onNavigate, isMobile = false }) {
  const { items, unreadCount, markAsRead, markAllRead, newItemSignal } = useNotifications(userEmail)
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const ref = useRef(null)
  const seenSignalRef = useRef(0)
  const seenIdsRef = useRef(new Set())

  // Quand un nouvel item arrive en realtime, on le push dans la file de toasts
  useEffect(() => {
    if (newItemSignal === 0 || newItemSignal === seenSignalRef.current) return
    seenSignalRef.current = newItemSignal
    if (!items.length) return
    const newest = items[0]
    if (seenIdsRef.current.has(newest.id)) return
    seenIdsRef.current.add(newest.id)
    setToasts((q) => {
      const next = [...q, newest]
      // Garde seulement les MAX_TOASTS plus récentes
      return next.slice(-MAX_TOASTS)
    })
  }, [newItemSignal, items])

  const dismissToast = (id) => setToasts((q) => q.filter((t) => t.id !== id))

  const handleToastClick = (notif) => {
    if (!notif.read_at) markAsRead(notif.id)
    if (onNavigate && notif.target_tab) onNavigate(notif.target_tab, notif)
  }

  // Ferme le panneau au clic extérieur / Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
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
    if (onNavigate && n.target_tab) onNavigate(n.target_tab, n)
  }

  const badge = unreadCount > 99 ? '99+' : unreadCount

  return (
    <>
      {/* Bouton activity + panneau dropdown */}
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Activité récente"
          title="Activité récente"
          style={{
            position: 'relative',
            background: open ? 'rgba(241,245,249,0.9)' : '#fff',
            border: '1px solid #E2E8F0',
            cursor: 'pointer',
            width: 36, height: 36,
            borderRadius: 10,
            color: unreadCount > 0 ? '#3B82F6' : '#334155',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            transition: 'background .15s, border-color .15s, color .15s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -4, right: -4,
              background: '#DC2626', color: '#fff',
              borderRadius: 999,
              minWidth: 18, height: 18,
              padding: '0 5px', fontSize: 10, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #fff', boxSizing: 'content-box', lineHeight: 1,
              animation: 'pulseBadge 2s ease-in-out infinite',
            }}>{badge}</span>
          )}
          <style>{`@keyframes pulseBadge{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.5)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}`}</style>
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 10px)', right: 0,
            width: 320, maxWidth: '92vw',
            background: 'rgba(255,255,255,0.78)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: '0 24px 60px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
            zIndex: 5000, overflow: 'hidden',
            animation: 'fadeInDown .22s cubic-bezier(.2,.9,.3,1.2)',
          }}>
            <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
            <div style={{
              padding: '12px 14px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
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
                    background: 'transparent', border: 'none', color: '#3B82F6',
                    cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    padding: '4px 6px', borderRadius: 5, fontFamily: 'inherit', whiteSpace: 'nowrap',
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
                  const accent = ACCENT[n.entity_type] || '#3B82F6'
                  return (
                    <li key={n.id} style={{ marginBottom: 2 }}>
                      <button
                        onClick={() => handleClick(n)}
                        style={{
                          width: '100%', textAlign: 'left',
                          background: unread ? 'rgba(59,130,246,0.08)' : 'transparent',
                          border: 'none', borderRadius: 10, padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          fontFamily: 'inherit', transition: 'background .12s',
                        }}
                      >
                        <span style={{
                          fontSize: 14, lineHeight: 1, flexShrink: 0,
                          width: 26, height: 26, borderRadius: 7,
                          background: accent + '22', color: accent,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{ICONS[n.entity_type] || '•'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: unread ? 600 : 500,
                            color: '#0F172A', lineHeight: 1.35,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>{n.title}</div>
                          {n.body && (
                            <div style={{
                              fontSize: 10, color: '#64748B', marginTop: 3, lineHeight: 1.4,
                              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>{n.body}</div>
                          )}
                          <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 4, fontWeight: 500, letterSpacing: '0.02em' }}>
                            {relativeTime(n.created_at)}
                          </div>
                        </div>
                        {unread && (
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: accent, flexShrink: 0, marginTop: 12,
                            boxShadow: `0 0 0 3px ${accent}33`,
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

      {/* Toaster en bas droite — slide-in à chaque nouvelle activité */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? 90 : 24,
          right: isMobile ? '4vw' : 24,
          zIndex: 4999,
          display: 'flex', flexDirection: 'column-reverse',
          pointerEvents: 'none',
        }}>
          <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
            {toasts.map((n, i) => (
              <Toast
                key={n.id}
                notif={n}
                index={i}
                total={toasts.length}
                onDismiss={dismissToast}
                onClick={handleToastClick}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
