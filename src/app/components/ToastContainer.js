'use client'
import { useToast, useToastList } from '../contexts/ToastContext'

/**
 * Composant ToastContainer
 * Affiche les notifications toast
 * À placer en haut de la hiérarchie de l'app
 *
 * Consomme les DEUX contextes (state + actions) : c'est le seul
 * composant de l'app qui lit la liste des toasts, donc lui seul
 * re-render quand un toast est ajouté/retiré.
 *
 * Un toast peut avoir un bouton d'action (ex: "Annuler" pour l'undo
 * sur delete). Le clic sur l'action dismiss automatiquement le toast.
 */
export default function ToastContainer() {
  const { toasts } = useToastList()
  const { removeToast } = useToast()

  const typeStyles = {
    success: {
      background: '#D1FAE5',
      borderColor: '#6EE7B7',
      textColor: '#065F46',
      iconColor: '#10B981',
    },
    error: {
      background: '#FEE2E2',
      borderColor: '#FCA5A5',
      textColor: '#7F1D1D',
      iconColor: '#EF4444',
    },
    warning: {
      background: '#FEF3C7',
      borderColor: '#FCD34D',
      textColor: '#92400E',
      iconColor: '#F59E0B',
    },
    info: {
      background: '#DBEAFE',
      borderColor: '#93C5FD',
      textColor: '#1E40AF',
      iconColor: '#3B82F6',
    },
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'ℹ',
  }

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 420,
      }}
    >
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translateX(20px) } to { opacity: 1; transform: translateX(0) } }
      `}</style>
      {toasts.map((toast) => {
        const style = typeStyles[toast.type] || typeStyles.info
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            style={{
              background: style.background,
              border: `1px solid ${style.borderColor}`,
              borderRadius: 10,
              padding: '12px 14px',
              color: style.textColor,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
              animation: 'toastIn .25s ease',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: style.iconColor,
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {icons[toast.type]}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action.onClick()
                  removeToast(toast.id)
                }}
                style={{
                  background: style.iconColor,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  flexShrink: 0,
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Fermer la notification"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: style.textColor,
                opacity: 0.6,
                fontSize: 14,
                padding: 0,
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
