'use client'
import { useEffect, useRef } from 'react'
import { useToast } from '../contexts/ToastContext'
import { BACK_BLOCKED_EVENT } from '../lib/leaveGuard'

/**
 * Message affiché quand le retour du téléphone est bloqué parce qu'une
 * fenêtre de saisie est ouverte (lib/leaveGuard). Monté une fois par
 * tableau de bord.
 */
export default function LeaveGuardNotice() {
  const { addToast } = useToast()
  const last = useRef(0)
  useEffect(() => {
    const onBlocked = () => {
      const now = Date.now()
      if (now - last.current < 2500) return
      last.current = now
      addToast('Fenêtre en cours : ferme-la avec ✕ ou Annuler pour quitter (rien n’est perdu).', 'info')
    }
    window.addEventListener(BACK_BLOCKED_EVENT, onBlocked)
    return () => window.removeEventListener(BACK_BLOCKED_EVENT, onBlocked)
  }, [addToast])
  return null
}
