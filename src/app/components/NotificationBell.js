'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNotifications, groupNotifications, badgeLabel } from '../hooks/useNotifications'

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
  devis:      '📄',
  contact:    '👷',
}

const ACCENT = {
  chantier:   '#34C759',
  os:         '#AF52DE',
  cr:         '#007AFF',
  task:       '#FF9500',
  attachment: '#32ADE6',
  comment:    '#FF2D55',
  signature:  '#8944AB',
  devis:      '#007AFF',
  contact:    '#FF9500',
}

const TOAST_DURATION_MS = 4500
const MAX_TOASTS = 3

/**
 * Toast individuel en bas droite (slide-in + auto-dismiss + hover pause).
 */
function Toast({ notif, index, total, onDismiss, onClick, isMobile }) {
  const accent = ACCENT[notif.entity_type] || '#007AFF'
  const icon = ICONS[notif.entity_type] || '•'
  const [hover, setHover] = useState(false)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef(null)
  // Minuteur de l'animation de fermeture (220 / 180 ms), coupé au démontage
  const closeTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(closeTimerRef.current), [])

  useEffect(() => {
    if (hover) { clearTimeout(timerRef.current); return }
    timerRef.current = setTimeout(() => {
      setClosing(true)
      closeTimerRef.current = setTimeout(() => onDismiss(notif.id), 220)
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
      onClick={() => {
        setClosing(true)
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = setTimeout(() => { onDismiss(notif.id); onClick?.(notif) }, 180)
      }}
      style={{
        width: isMobile ? '92vw' : 340,
        maxWidth: 360,
        marginBottom: 8,
        padding: '11px 14px',
        // Fond quasi opaque : lisible quel que soit le contenu dessous
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(36px) saturate(200%)',
        border: '1px solid var(--separator)',
        borderRadius: 12,
        boxShadow: '0 14px 36px rgba(0,0,0,0.16)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        transform: `translateY(${closing ? '20px' : -offsetY + 'px'}) scale(${closing ? 0.95 : scale})`,
        opacity: closing ? 0 : 1,
        transition: 'transform .22s cubic-bezier(.22,1,.36,1), opacity .22s ease',
        animation: 'notifyIn .28s cubic-bezier(.22,1,.36,1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span style={{
        fontSize: 14, lineHeight: 1, flexShrink: 0,
        width: 26, height: 26, borderRadius: 7,
        background: accent + '22', color: accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--label)',
          lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{notif.title}</div>
        {notif.body && (
          <div style={{
            fontSize: 11, color: 'var(--label-secondary)', marginTop: 3, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{notif.body}</div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setClosing(true); setTimeout(() => onDismiss(notif.id), 180) }}
        aria-label="Fermer"
        style={{
          background: 'transparent', border: 'none', color: 'var(--label-secondary)',
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
    </div>
  )
}

/**
 * Cloche d'activité + toaster en bas droite.
 *
 * Comportement 2026 :
 *   - Bouton activity en topbar avec badge (compteur de non-lues)
 *   - Au clic → panneau dropdown avec les 10 dernières lignes (manuel uniquement),
 *     les notifications d'un même élément regroupées en une ligne « X modifications »
 *   - Badge : non-lues des 7 derniers jours, hors actions de l'utilisateur, « 9+ » au-delà de 9
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

  // Stable : dans les deps du minuteur de chaque Toast (sinon il repartirait à chaque rendu)
  const dismissToast = useCallback((id) => setToasts((q) => q.filter((t) => t.id !== id)), [])

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

  // Ouvrir une ligne marque tout le groupe comme lu
  const handleClick = async (g) => {
    setOpen(false)
    if (g.unreadIds.length) markAsRead(g.unreadIds)
    if (onNavigate && g.latest.target_tab) onNavigate(g.latest.target_tab, g.latest)
  }

  const groups = groupNotifications(items)
  const hasUnread = unreadCount > 0 || items.some((n) => !n.read_at)
  const badge = badgeLabel(unreadCount)

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
            background: open ? 'rgba(242,242,247,0.9)' : '#fff',
            border: '1px solid var(--separator)',
            cursor: 'pointer',
            width: 40, height: 40,
            borderRadius: 10,
            color: unreadCount > 0 ? 'var(--accent-text)' : 'var(--label-2)',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            transition: 'background .15s, border-color .15s, color .15s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -6, right: -6,
              background: 'var(--red)', color: '#fff',
              borderRadius: 999,
              minWidth: 16, height: 16,
              padding: '0 4px', fontSize: 11, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #fff', boxSizing: 'content-box', lineHeight: 1,
            }}>{badge}</span>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 10px)', right: 0,
            width: 360, maxWidth: 'calc(100vw - 24px)',
            // Fond opaque : la page ne doit pas transparaître sous la liste
            background: '#fff',
            borderRadius: 14,
            border: '1px solid var(--separator)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.20)',
            zIndex: 5000, overflow: 'hidden',
            animation: 'fadeInDown .22s cubic-bezier(.22,1,.36,1)',
          }}>
            <div style={{
              padding: '12px 14px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--label)', letterSpacing: '-0.01em' }}>
                  Activité
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--accent-text)',
                    background: 'rgba(0,122,255,0.12)',
                    padding: '2px 7px', borderRadius: 999, lineHeight: 1.4, whiteSpace: 'nowrap',
                  }}>{unreadCount} nouveau{unreadCount > 1 ? 'x' : ''}</span>
                )}
              </div>
              {hasUnread && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--accent-text)',
                    cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 36,
                    padding: '4px 6px', borderRadius: 8, fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >Tout marquer comme lu</button>
              )}
            </div>

            {groups.length === 0 ? (
              <div style={{ padding: '24px 16px 28px', textAlign: 'center', color: 'var(--label-secondary)', fontSize: 12 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D1D6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6, opacity: 0.7 }} aria-hidden="true">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <div style={{ fontWeight: 600, color: 'var(--label-secondary)', fontSize: 12 }}>Tout est calme</div>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '2px 6px 8px', maxHeight: 'min(70vh, 520px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
                {groups.map((g) => {
                  const n = g.latest
                  const unread = g.unreadIds.length > 0
                  const accent = ACCENT[n.entity_type] || '#007AFF'
                  return (
                    <li key={g.key} style={{ marginBottom: 2 }}>
                      <button
                        onClick={() => handleClick(g)}
                        style={{
                          width: '100%', textAlign: 'left',
                          background: unread ? 'var(--accent-tint)' : 'transparent',
                          border: 'none', borderRadius: 10, padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          fontFamily: 'inherit', transition: 'background .12s',
                        }}
                      >
                        <span style={{
                          fontSize: 14, lineHeight: 1, flexShrink: 0,
                          width: 30, height: 30, borderRadius: 8,
                          background: accent + '22', color: accent,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{ICONS[n.entity_type] || '•'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 15, fontWeight: unread ? 600 : 400,
                            color: 'var(--label)', lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>{n.title}</div>
                          {n.body && (
                            <div style={{
                              fontSize: 13, color: 'var(--label-secondary)', marginTop: 2, lineHeight: 1.4,
                              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>{n.body}</div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--label-tertiary)', marginTop: 4 }}>
                            {relativeTime(n.created_at)}
                            {g.count > 1 && (
                              <span style={{ marginLeft: 6, fontWeight: 700, color: accent }}>
                                · {g.count} modifications
                              </span>
                            )}
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
