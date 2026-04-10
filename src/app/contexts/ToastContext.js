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
 */

const ToastActionsContext = createContext(null)
const ToastStateContext = createContext(null)

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

  const addToast = useCallback(
    (message, type = 'info', duration = 3000) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, type, duration }])

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, duration)
      }
    },
    []
  )

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Actions : stable entre renders (addToast et removeToast sont en
  // useCallback([]) donc leurs refs ne changent jamais)
  const actions = useMemo(
    () => ({ addToast, removeToast }),
    [addToast, removeToast]
  )

  // State : change quand la liste de toasts change
  const state = useMemo(() => ({ toasts }), [toasts])

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  )
}
