'use client'
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

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
 * - Enter = Confirmer (focus automatique sur le bouton confirmer)
 * - `danger: true` → bouton rouge pour les actions destructives
 */

const ConfirmContext = createContext(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
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
  if (typeof window !== 'undefined' && isOpen) {
    // setTimeout car le render est synchrone ; on attend le mount du bouton
    setTimeout(() => confirmBtnRef.current?.focus(), 30)
  }

  if (!isOpen) return null

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onResolve(false); return }
    if (e.key === 'Enter')  { e.preventDefault(); onResolve(true); return }
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
  const accentColor = danger ? '#DC2626' : '#1E3A5F'
  const accentBg = danger ? '#FEF2F2' : '#EFF6FF'

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
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
        fontFamily: "var(--font-dm-sans), sans-serif",
        animation: 'fadeIn .15s ease',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes confirmPop { from { opacity: 0; transform: scale(0.96) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '24px 24px 20px',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 25px 50px rgba(15,23,42,0.3)',
          animation: 'confirmPop .2s ease',
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
            <h3 id="confirm-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
              {title}
            </h3>
            {message && (
              <p id="confirm-message" style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
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
              border: '1px solid #E2E8F0',
              background: '#fff',
              color: '#475569',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => onResolve(true)}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: danger ? '#DC2626' : '#1E3A5F',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: `0 2px 8px ${danger ? 'rgba(220,38,38,0.3)' : 'rgba(30,58,95,0.3)'}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
