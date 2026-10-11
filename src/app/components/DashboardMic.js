'use client'
import { memo } from 'react'
import FloatingMic from './FloatingMic'
import { useFloatingMic } from '../hooks/useFloatingMic'
import { useToast } from '../contexts/ToastContext'

/**
 * Micro flottant des tableaux de bord, avec son propre état de dictée :
 * la transcription en direct ne redessine que ce composant, plus tout le
 * tableau de bord et ses onglets restés montés à chaque mot reconnu.
 * Le texte ne remonte qu'à l'envoi (`onSend(texte)`).
 */
function DashboardMic({ isMobile, bottomOffset = 0, onSend }) {
  const { addToast } = useToast()
  const { listening, transcript, toggle, clear } = useFloatingMic({
    onError: (msg) => addToast(msg, 'warning'),
  })
  return (
    <FloatingMic
      listening={listening}
      onClick={toggle}
      transcript={transcript}
      isMobile={isMobile}
      bottomOffset={bottomOffset}
      onSend={() => { const t = transcript; clear(); onSend?.(t) }}
      onClear={clear}
    />
  )
}

export default memo(DashboardMic)
