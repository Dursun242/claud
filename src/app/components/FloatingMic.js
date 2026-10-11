'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon, I, btnP, btnS } from '../dashboards/shared'

// Marge basse + bouton (64) + marge haute : place à réserver en bas du
// contenu défilant (mobile) pour que la dernière ligne passe au-dessus de la bulle
export const FLOATING_MIC_CLEARANCE = 24 + 64 + 24
// Délai sans défilement avant que la bulle reprenne sa taille
export const COMPACT_IDLE_MS = 600

const prefersReducedMotion = () => {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * true pendant un défilement vers le bas (n'importe quel conteneur : on écoute
 * en capture sur document, le contenu défile dans <main> et non la fenêtre),
 * false au défilement vers le haut ou après COMPACT_IDLE_MS sans défilement.
 */
function useCompactOnScroll(enabled) {
  const [compact, setCompact] = useState(false)
  const lastRef = useRef({ el: null, top: 0 })
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled) { setCompact(false); return }
    const onScroll = (e) => {
      const el = e.target === document ? (document.scrollingElement || document.documentElement) : e.target
      if (!el || typeof el.scrollTop !== 'number') return
      const top = el.scrollTop
      const last = lastRef.current
      lastRef.current = { el, top }
      if (last.el !== el) return // premier événement de ce conteneur : simple point de départ
      if (top > last.top + 2) setCompact(true)
      else if (top < last.top - 2) setCompact(false)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCompact(false), COMPACT_IDLE_MS)
    }
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      clearTimeout(timerRef.current)
    }
  }, [enabled])

  return compact
}

/**
 * Composant FloatingMic
 * Bouton microphone flottant (marine, rouge pendant l'écoute) avec transcription en direct
 * Affiche une bulle de transcription et gère le contrôle de la saisie vocale
 *
 * Accessibilité :
 * - aria-label explicite + aria-pressed pour l'état d'écoute
 * - Title pour le tooltip desktop
 * - Transcript en aria-live="polite" pour annoncer aux lecteurs d'écran
 * - Focus visible respecté (pas d'outline:none sur ce bouton)
 *
 * Défilement : la bulle se réduit et devient semi-transparente pendant un
 * défilement vers le bas (hors écoute), et reprend sa taille à l'arrêt ou au
 * défilement vers le haut. Sans animation si prefers-reduced-motion.
 */
export default function FloatingMic({
  listening,
  onClick,
  transcript,
  onSend,
  onClear,
  isMobile,
  // Décalage vertical (px) pour ne pas recouvrir la barre de navigation mobile
  bottomOffset = 0,
}) {
  const compact = useCompactOnScroll(!listening)
  const reduceMotion = prefersReducedMotion()
  return (
    <>
      {/* FLOATING BUTTON — fixed bottom-right */}
      <div
        data-testid="floating-mic"
        data-compact={compact ? 'true' : 'false'}
        style={{
          position: 'fixed',
          // + safe-area iOS : la barre de navigation basse l'inclut aussi
          bottom: isMobile ? `calc(${24 + bottomOffset}px + env(safe-area-inset-bottom))` : 32,
          right: isMobile ? 24 : 32,
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          transform: compact ? 'scale(0.7)' : 'none',
          transformOrigin: 'bottom right',
          opacity: compact ? 0.45 : 1,
          transition: reduceMotion ? 'none' : 'transform .2s cubic-bezier(.4,0,.2,1), opacity .2s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Transcription en direct pendant l'écoute */}
        {listening && transcript && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '12px 14px',
              maxWidth: isMobile ? 260 : 340,
              color: '#1C1C1E',
              fontSize: 13,
              lineHeight: 1.5,
              border: '1px solid #E5E5EA',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              animation: 'fadeIn .2s ease',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#D70015',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#D70015' }}
              />
              Transcription en direct
            </div>
            <div style={{ color: '#3A3A3C' }}>{transcript}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={onSend} style={{ ...btnP, fontSize: 13, minHeight: 36, padding: '8px 14px' }}>
                Envoyer à l&apos;IA
              </button>
              <button
                onClick={onClear}
                aria-label="Effacer la transcription et arrêter l'écoute"
                style={{ ...btnS, fontSize: 13, minHeight: 36, padding: '8px 12px' }}
              >
                Effacer
              </button>
            </div>
          </div>
        )}

        {/* Bouton micro : marine au repos (sans animation), rouge pendant l'écoute */}
        <button
          onClick={onClick}
          aria-label={listening ? "Arrêter l'écoute vocale" : "Démarrer l'écoute vocale pour dicter à l'IA"}
          aria-pressed={!!listening}
          title={listening ? "Cliquer pour arrêter" : "Dicter à l'IA"}
          className="u-icon-btn"
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            margin: 4,
            borderRadius: '50%',
            background: listening ? '#D70015' : '#0071E3',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            fontFamily: 'inherit',
          }}
        >
          <Icon d={I.mic} size={24} color="#fff"/>
          {listening && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                border: '2px solid rgba(215,0,21,0.4)',
                animation: 'ripple 1.2s ease-out infinite',
              }}
            />
          )}
        </button>
      </div>
    </>
  )
}
