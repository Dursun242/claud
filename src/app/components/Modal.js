'use client'
import { useEffect, useRef } from 'react'

/**
 * Composant Modal réutilisable
 * Modale avec backdrop, close button, focus trap et Escape.
 *
 * Accessibilité :
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Escape ferme la modale (si onClose est fourni)
 * - Focus trap : Tab et Shift+Tab bouclent à l'intérieur de la modale
 * - Le focus est rendu au déclencheur à la fermeture
 * - Scroll du body bloqué quand ouvert
 */
export default function Modal({ open, onClose, title, children, wide = false }) {
  const contentRef = useRef(null)
  const previouslyFocused = useRef(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`)

  // Escape pour fermer + focus trap Tab/Shift+Tab
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = contentRef.current
      if (!root) return
      const focusables = root.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Bloque le scroll du body quand la modale est ouverte + gère le focus
  useEffect(() => {
    if (!open) return
    // Mémorise l'élément qui avait le focus (pour le restaurer à la fermeture)
    previouslyFocused.current = document.activeElement
    // Auto-focus sur le 1er élément focusable (input, textarea, bouton)
    const t = setTimeout(() => {
      const root = contentRef.current
      if (!root) return
      const firstInput = root.querySelector('input:not([type="hidden"]), textarea, select')
      if (firstInput) firstInput.focus()
    }, 50)
    // Bloque le scroll du body
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
      // Restaure le focus sur le déclencheur (s'il existe encore)
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === 'function') {
        previouslyFocused.current.focus()
      }
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId.current}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(4px)',
        padding: 16,
        animation: 'fadeIn .15s ease',
      }}
      onClick={onClose}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '20px',
          width: wide ? 700 : 520,
          maxWidth: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px rgba(15,23,42,0.25)',
          animation: 'fadeIn .2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <h3
            id={titleId.current}
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: '#0F172A',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              cursor: 'pointer',
              width: 30,
              height: 30,
              fontSize: 16,
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9' }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
