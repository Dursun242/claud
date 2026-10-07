'use client'
import { useEffect, useRef, useState } from 'react'
import { ANIMATION } from '../lib/motion'
import { useLeaveGuard } from '../hooks/useLeaveGuard'
import { useOptionalConfirm } from '../contexts/ConfirmContext'

/**
 * Composant Modal réutilisable
 * Modale avec backdrop, close button et focus trap.
 *
 * Protection du travail en cours :
 * - la modale ne se ferme QUE par ← (retour), ✕ ou par les boutons de la fenêtre
 *   (Annuler, Enregistrer…) : ni clic à côté, ni touche Échap ;
 * - ← ou ✕ après une saisie demande confirmation ;
 * - tant qu'elle est ouverte, le retour du téléphone, la fermeture ou le
 *   rechargement de la page ne font pas perdre la saisie (useLeaveGuard).
 *
 * Accessibilité :
 * - role="dialog" + aria-modal="true" + aria-labelledby
 * - Focus trap : Tab et Shift+Tab bouclent à l'intérieur de la modale
 * - Le focus est rendu au déclencheur à la fermeture
 * - Scroll du body bloqué quand ouvert
 */
export default function Modal({ open, onClose, title, children, wide = false }) {
  const contentRef = useRef(null)
  const dirty = useRef(false)
  const confirm = useOptionalConfirm()
  useLeaveGuard(open)
  useEffect(() => { if (open) dirty.current = false }, [open])
  const closeFromX = async () => {
    if (!onClose) return
    if (dirty.current && confirm) {
      const ok = await confirm({
        title: 'Fermer sans enregistrer ?',
        message: 'Ce que tu as saisi dans cette fenêtre sera perdu.',
        confirmLabel: 'Fermer sans enregistrer',
        cancelLabel: 'Continuer la saisie',
        danger: true,
      })
      if (!ok) return
    }
    onClose()
  }
  const previouslyFocused = useRef(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`)
  // Détection mobile pour padding et arrondis adaptés (évite d'écraser
  // le layout 16px du modal sur petit écran)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640)
    check()
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', check)
      return () => window.removeEventListener('resize', check)
    }
  }, [])

  // Focus trap Tab/Shift+Tab (Échap ne ferme pas : évite de perdre une saisie)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
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
  }, [open])

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
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(4px)',
        padding: isMobile ? 0 : 16,
        animation: ANIMATION.fadeInFast,
        overscrollBehavior: 'contain',
      }}
    >
      <div
        ref={contentRef}
        onInput={() => { dirty.current = true }}
        onChange={() => { dirty.current = true }}
        style={{
          background: '#fff',
          // Sur mobile : bord plat en bas, plein écran avec marge haut,
          // pour un look bottom-sheet natif
          borderRadius: isMobile ? '16px 16px 0 0' : 16,
          padding: isMobile ? '18px 16px 20px' : '20px',
          // wide : 700 px ; wide="xl" : 1040 px (éditeur de devis)
          width: wide === 'xl' ? 1040 : wide ? 700 : 520,
          maxWidth: '100%',
          maxHeight: isMobile ? '92vh' : wide === 'xl' ? '92vh' : '85vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px rgba(15,23,42,0.25)',
          animation: ANIMATION.popIn,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
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
          {onClose && (
            <button
              type="button"
              onClick={closeFromX}
              aria-label="Retour"
              title="Retour"
              className="u-icon-btn u-icon-btn--soft"
              style={{
                borderRadius: 8,
                width: 32,
                height: 32,
                fontSize: 18,
                color: '#475569',
                flexShrink: 0,
              }}
            >
              ←
            </button>
          )}
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
            type="button"
            onClick={closeFromX}
            aria-label="Fermer"
            className="u-icon-btn u-icon-btn--soft"
            style={{
              borderRadius: 8,
              width: 32,
              height: 32,
              fontSize: 16,
              color: '#475569',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
