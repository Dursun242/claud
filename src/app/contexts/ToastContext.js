'use client'
import { createContext, useContext, useState, useCallback, useMemo } from 'react'

/**
 * ToastContext — split en DEUX contextes pour éviter les re-renders
 * en cascade.
 *
 * - ToastActionsContext  : { addToast, removeToast } — stable, les
 *                          références ne changent jamais → les 15+
 *                          consommateurs ne re-render pas quand un
 *                          nouveau toast est ajouté.
 * - ToastStateContext    : { toasts } — change à chaque toast. Seul
 *                          ToastContainer l'écoute.
 *
 * API publique :
 *   useToast()     → { addToast, removeToast }
 *   useToastList() → { toasts } (uniquement pour le container)
 *
 * addToast peut accepter :
 *   addToast('Message', 'success')                          // simple
 *   addToast('Message', 'success', 5000)                    // durée custom
 *   addToast('Message', 'info', { action: { label, onClick }}) // avec bouton
 *   addToast('Message', 'info', { duration: 0 })            // persistant (pas d'auto-dismiss)
 *
 * Retourne l'id du toast créé pour pouvoir le supprimer plus tard.
 */

const ToastActionsContext = createContext(null)
const ToastStateContext = createContext(null)

// Compteur monotone — garantit l'unicité des IDs même pour des appels
// synchrones successifs (Date.now() peut répéter la même valeur dans
// la même milliseconde sous Node.js en test).
let _toastIdCounter = 0

export function useToast() {
  const ctx = useContext(ToastActionsContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function useToastList() {
  const ctx = useContext(ToastStateContext)
  if (!ctx) throw new Error('useToastList must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', optsOrDuration = 3000) => {
    // Rétro-compatibilité : 3e argument peut être un number (duration) ou un objet d'options
    const opts = typeof optsOrDuration === 'number'
      ? { duration: optsOrDuration }
      : (optsOrDuration || {})
    const duration = opts.duration ?? 3000
    const action = opts.action || null

    const id = ++_toastIdCounter
    setToasts((prev) => [...prev, { id, message, type, duration, action }])

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const actions = useMemo(
    () => ({ addToast, removeToast }),
    [addToast, removeToast]
  )

  const state = useMemo(() => ({ toasts }), [toasts])

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  )
}
