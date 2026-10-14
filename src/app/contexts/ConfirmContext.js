'use client'
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { ANIMATION } from '../lib/motion'

/**
 * ConfirmContext — remplace `window.confirm()` par une modale brandée.
 *
 * Usage :
 *   const confirm = useConfirm()
 *   const ok = await confirm({
 *     title: "Supprimer ce chantier ?",
 *     message: "Cette action est irréversible.",
 *     confirmLabel: "Supprimer",
 *     danger: true,
 *   })
 *   if (ok) { ...go ahead... }
 *
 * La modale supporte :
 * - Focus trap (via le composant Modal sous-jacent)
 * - Escape = Annuler
 * - Enter = Confirmer (focus automatique sur le bouton confirmer ; sur un
 *   bouton, Entrée garde son effet natif : « Annuler » annule)
 * - `danger: true` → bouton rouge pour les actions destructives
 */

const ConfirmContext = createContext(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

/** Comme useConfirm, mais null hors ConfirmProvider (composants génériques). */
export function useOptionalConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null) // null ou { title, message, confirmLabel, cancelLabel, danger }
  const resolverRef = useRef(null)

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setState({
        title: opts.title || 'Confirmer ?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirmer',
        cancelLabel: opts.cancelLabel || 'Annuler',
        danger: !!opts.danger,
      })
    })
  }, [])

  const handleResolve = useCallback((value) => {
    if (resolverRef.current) {
      resolverRef.current(value)
      resolverRef.current = null
    }
    setState(null)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog state={state} onResolve={handleResolve} />
    </ConfirmContext.Provider>
  )
}

// ───────────────────────────────────────────────────────
// Composant de dialogue — rendu au niveau du provider.
// Pas de dépendance au Modal.js existant pour garder ce fichier autonome
// (ConfirmProvider est monté au-dessus de toute l'app dans RootWrapper).
// ───────────────────────────────────────────────────────
function ConfirmDialog({ state, onResolve }) {
  const confirmBtnRef = useRef(null)
  const contentRef = useRef(null)

  // Auto-focus sur le bouton Confirmer à l'ouverture (pour un Enter direct)
  // + focus trap Tab/Shift+Tab + Escape = cancel + body scroll lock
  const isOpen = !!state
  useEffect(() => {
    if (!isOpen) return
    // setTimeout : on laisse l'animation d'ouverture démarrer avant le focus
    const id = setTimeout(() => confirmBtnRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [isOpen])

  if (!isOpen) return null

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onResolve(false); return }
    // Entrée sur un bouton : on laisse le clic natif du bouton agir
    // (sinon Tab sur « Annuler » + Entrée confirmerait la suppression)
    if (e.key === 'Enter') {
      if ((e.target?.tagName || '').toLowerCase() === 'button') return
      e.preventDefault(); onResolve(true); return
    }
    // Focus trap simple
    if (e.key === 'Tab' && contentRef.current) {
      const focusables = contentRef.current.querySelectorAll('button')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
  }

  const { title, message, confirmLabel, cancelLabel, danger } = state
  const accentColor = danger ? '#D70015' : '#0071E3'
  const accentBg = danger ? '#FFF0EF' : '#EAF3FF'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onKeyDown={handleKeyDown}
      onClick={() => onResolve(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
        fontFamily: "var(--font-dm-sans), sans-serif",
        animation: ANIMATION.fadeInFast,
      }}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '24px 24px 20px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          animation: ANIMATION.popIn,
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: accentBg, color: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>
            {danger ? '⚠' : '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--label)', lineHeight: 1.3 }}>
              {title}
            </h3>
            {message && (
              <p id="confirm-message" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--label-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {message}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onResolve(false)}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid var(--separator)',
              background: '#fff',
              color: '#48484A',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {cancelLabel}
          </button>
          <button data-tone={danger ? 'danger' : 'accent'}
            ref={confirmBtnRef}
            onClick={() => onResolve(true)}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: danger ? 'var(--red-text)' : 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: `0 2px 8px ${danger ? 'rgba(215,0,21,0.3)' : 'rgba(0,113,227,0.3)'}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
