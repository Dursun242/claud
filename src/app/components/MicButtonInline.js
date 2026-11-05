'use client'
import { Icon, I } from './icons'

/**
 * Composant MicButtonInline
 * Petit bouton microphone pour intégration en ligne (dans champs d'entrée)
 * Version compacte de FloatingMic : aplat bleu au repos, rouge pendant
 * l'écoute, sans dégradé ni lueur.
 */
export default function MicButtonInline({ listening, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? "Arrêter la dictée" : "Dicter à l'assistant"}
      aria-pressed={!!listening}
      className="u-btn"
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: listening ? 'var(--red-text)' : 'var(--accent)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color var(--motion-fast) var(--ease-emphasized)',
        flexShrink: 0,
      }}
    >
      <Icon d={I.mic} size={18} stroke={1.75} color="#fff" />
    </button>
  )
}
