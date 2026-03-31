'use client'
import { useToast } from '../contexts/ToastContext'

/**
 * Composant ToastContainer
 * Affiche les notifications toast
 * À placer en haut de la hiérarchie de l'app
 */
export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

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
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 400,
      }}
    >
      {toasts.map((toast) => {
        const style = typeStyles[toast.type] || typeStyles.info
        return (
          <div
            key={toast.id}
            style={{
              background: style.background,
              border: `1px solid ${style.borderColor}`,
              borderRadius: 8,
              padding: '12px 16px',
              color: style.textColor,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              animation: 'slideIn 0.3s ease',
            }}
          >
            <span
              style={{
                color: style.iconColor,
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {icons[toast.type]}
            </span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: style.textColor,
                opacity: 0.6,
                fontSize: 14,
                padding: 0,
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
