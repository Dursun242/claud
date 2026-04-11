'use client'

/**
 * Composant FloatingMic
 * Bouton microphone flottant neon avec transcription en direct
 * Affiche une bulle de transcription et gère le contrôle de la saisie vocale
 *
 * Accessibilité :
 * - aria-label explicite + aria-pressed pour l'état d'écoute
 * - Title pour le tooltip desktop
 * - Transcript en aria-live="polite" pour annoncer aux lecteurs d'écran
 * - Focus visible respecté (pas d'outline:none sur ce bouton)
 */
export default function FloatingMic({
  listening,
  onClick,
  transcript,
  onSend,
  onClear,
  isMobile,
}) {
  return (
    <>
      {/* FLOATING BUTTON — fixed bottom-right */}
      <div
        style={{
          position: 'fixed',
          bottom: isMobile ? 24 : 32,
          right: isMobile ? 24 : 32,
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
        }}
      >
        {/* Transcript bubble when listening */}
        {listening && transcript && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: 'rgba(15,23,42,0.92)',
              backdropFilter: 'blur(12px)',
              borderRadius: 16,
              padding: '12px 16px',
              maxWidth: isMobile ? 260 : 340,
              color: '#fff',
              fontSize: 13,
              lineHeight: 1.5,
              border: '1px solid rgba(0,255,136,0.25)',
              boxShadow:
                '0 0 20px rgba(0,255,136,0.15), 0 8px 32px rgba(0,0,0,0.3)',
              animation: 'fadeIn .2s ease',
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#00FF88',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#00FF88',
                  animation: 'neonPulse 1s infinite',
                }}
              />
              Transcription en direct
            </div>
            <div>{transcript}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button
                onClick={onSend}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  background: '#00FF88',
                  color: '#0F172A',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Envoyer à l&apos;IA
              </button>
              <button
                onClick={onClear}
                aria-label="Effacer la transcription et arrêter l'écoute"
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#E2E8F0',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                Effacer
              </button>
            </div>
          </div>
        )}

        {/* The neon mic button */}
        <button
          onClick={onClick}
          aria-label={listening ? "Arrêter l'écoute vocale" : "Démarrer l'écoute vocale pour dicter à l'IA"}
          aria-pressed={!!listening}
          title={listening ? "Cliquer pour arrêter" : "Dicter à l'IA"}
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: listening
              ? 'radial-gradient(circle at 40% 40%, #ff2d2d 0%, #cc0000 60%, #990000 100%)'
              : 'radial-gradient(circle at 40% 40%, #1E3A5F 0%, #0F172A 70%)',
            border: listening
              ? '2px solid rgba(255,50,50,0.6)'
              : '2px solid rgba(0,255,136,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: listening
              ? '0 0 15px rgba(255,50,50,0.6), 0 0 40px rgba(255,50,50,0.3), 0 0 80px rgba(255,50,50,0.15), inset 0 0 15px rgba(255,100,100,0.2)'
              : '0 0 12px rgba(0,255,136,0.3), 0 0 30px rgba(0,255,136,0.15), 0 0 60px rgba(0,255,136,0.07), inset 0 0 10px rgba(0,255,136,0.08)',
            transition: 'transform .2s cubic-bezier(0.4,0,0.2,1), box-shadow .4s',
            animation: listening
              ? 'none'
              : 'neonBreathing 3s ease-in-out infinite',
            fontFamily: 'inherit',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)' }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {/* IA text with heartbeat */}
          <span
            aria-hidden="true"
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '-0.5px',
              color: listening ? '#fff' : '#00FF88',
              fontFamily: "'DM Sans', sans-serif",
              animation: listening
                ? 'heartbeat 0.8s ease-in-out infinite'
                : 'none',
              filter: listening
                ? 'drop-shadow(0 0 4px rgba(255,200,200,0.8))'
                : 'drop-shadow(0 0 3px rgba(0,255,136,0.6))',
              userSelect: 'none',
            }}
          >
            IA
          </span>

          {/* Neon glow rings (décoratifs — aria-hidden) */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `2px solid ${
                listening
                  ? 'rgba(255,80,80,0.5)'
                  : 'rgba(0,255,136,0.35)'
              }`,
              animation: listening
                ? 'ripple 1.2s ease-out infinite'
                : 'neonRing 3s ease-in-out infinite',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: -8,
              borderRadius: '50%',
              border: `1.5px solid ${
                listening
                  ? 'rgba(255,80,80,0.25)'
                  : 'rgba(0,255,136,0.15)'
              }`,
              animation: listening
                ? 'ripple 1.2s ease-out infinite 0.25s'
                : 'neonRing 3s ease-in-out infinite 1s',
            }}
          />
          {listening && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: -14,
                borderRadius: '50%',
                border: '1px solid rgba(255,80,80,0.12)',
                animation: 'ripple 1.2s ease-out infinite 0.5s',
              }}
            />
          )}
        </button>
      </div>
    </>
  )
}
