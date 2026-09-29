'use client'
import { fmtDateTime } from '../lib/offlineFormat'

/**
 * Bandeau d'état réseau : hors ligne (données locales) et/ou modifications
 * en attente d'envoi. Rien quand tout est en ligne et synchronisé.
 */
export default function OfflineBanner({ online, pending, restoredAt, onRetry }) {
  if (online && !pending) return null
  const text = !online
    ? `Hors ligne — tu consultes les dernières données enregistrées sur cet appareil${restoredAt ? ` (${fmtDateTime(restoredAt)})` : ''}.`
    : `${pending} modification${pending > 1 ? 's' : ''} en attente d’envoi.`
  return (
    <div role="status" aria-live="polite" style={{
      // Pastille flottante : ne décale pas la mise en page des dashboards
      position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      width: 'max-content', maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: online ? '#FFFBEB' : '#1E293B', color: online ? '#92400E' : '#F8FAFC',
      border: `1px solid ${online ? '#FDE68A' : '#0F172A'}`, borderRadius: 12,
      boxShadow: '0 6px 20px rgba(15,23,42,0.18)', padding: '8px 14px', fontSize: 13, fontWeight: 600,
    }}>
      <span aria-hidden="true">{online ? '⏳' : '📴'}</span>
      <span style={{ flex: 1, minWidth: 200 }}>
        {text}
        {!online && pending > 0 && (pending > 1
          ? ` ${pending} modifications seront envoyées au retour du réseau.`
          : ' 1 modification sera envoyée au retour du réseau.')}
        {!online && !pending && ' Les cases de tâches cochées seront envoyées au retour du réseau.'}
      </span>
      {online && pending > 0 && onRetry && (
        <button onClick={onRetry} style={{
          background: '#92400E', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>Envoyer maintenant</button>
      )}
    </div>
  )
}
