'use client'

/**
 * Composant MicButtonInline
 * Petit bouton microphone pour intégration en ligne (dans champs d'entrée)
 * Version compacte de FloatingMic
 */
export default function MicButtonInline({ listening, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: listening
          ? 'linear-gradient(135deg, #FF3B30, #D70015)'
          : 'linear-gradient(135deg, #0071E3, #007AFF)',
        border: listening
          ? '2px solid rgba(255,80,80,0.4)'
          : '2px solid rgba(0,255,136,0.2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: listening
          ? '0 0 12px rgba(255,59,48,0.5)'
          : '0 0 8px rgba(0,255,136,0.2)',
        transition: 'all .3s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: '#fff',
          fontFamily: "var(--font-dm-sans), sans-serif",
          animation: listening ? 'heartbeat 0.8s ease-in-out infinite' : 'none',
          userSelect: 'none',
        }}
      >
        IA
      </span>
    </button>
  )
}
