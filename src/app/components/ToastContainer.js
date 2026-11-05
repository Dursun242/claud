'use client'
import { useToast, useToastList } from '../contexts/ToastContext'
import { ANIMATION } from '../lib/motion'
import { Icon, I } from './icons'

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
      background: '#EAF8EE',
      borderColor: '#BFE9CA',
      textColor: '#1E7B34',
      iconColor: '#34C759',
    },
    error: {
      background: '#FFE3E1',
      borderColor: '#FFC9C6',
      textColor: '#7F1D1D',
      iconColor: '#FF3B30',
    },
    warning: {
      background: '#FFF7E8',
      borderColor: '#FFDDA6',
      textColor: '#A0390C',
      iconColor: '#FF9500',
    },
    info: {
      background: '#DCEBFF',
      borderColor: '#C6DDF7',
      textColor: '#0066CC',
      iconColor: '#007AFF',
    },
  }

  const icons = {
    success: I.check,
    error: I.alert,
    warning: I.alert,
    info: I.info,
  }

  return (
    <div
      role="region"
      aria-label="Notifications"
      // Zone toujours présente : les messages qui y arrivent sont lus par
      // les lecteurs d'écran (les erreurs, elles, sont des alertes)
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 420,
      }}
    >
      {toasts.map((toast) => {
        const style = typeStyles[toast.type] || typeStyles.info
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : undefined}
            style={{
              background: '#fff',
              border: '1px solid var(--separator)',
              borderRadius: 12,
              padding: '12px 16px',
              color: 'var(--label)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
              animation: ANIMATION.toastIn,
              fontFamily: "var(--font-dm-sans), sans-serif",
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: style.textColor, display: 'inline-flex', flexShrink: 0 }}
            >
              <Icon d={icons[toast.type] || I.info} size={18} stroke={1.75} />
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action.onClick()
                  removeToast(toast.id)
                }}
                className="u-btn"
                style={{
                  // Texte sombre sur blanc : lisible quelle que soit la couleur du message
                  background: '#fff',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--separator-opaque)',
                  borderRadius: 8,
                  padding: '0 12px',
                  minHeight: 32,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Fermer la notification"
              className="u-icon-btn"
              style={{
                color: 'var(--label-tertiary)',
                padding: 0,
                width: 28,
                height: 28,
                borderRadius: 8,
                flexShrink: 0,
              }}
            >
              <Icon d={I.x} size={14} stroke={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
