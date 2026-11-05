'use client'
import { fmtDateTime } from '../lib/offlineFormat'
import { Icon, I } from './icons'

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
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: online ? 'var(--orange-tint)' : '#2C2C2E', color: online ? 'var(--orange-deep)' : 'var(--row-fill)',
      border: `1px solid ${online ? 'var(--orange-line)' : 'var(--label)'}`, borderRadius: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '8px 16px', fontSize: 13, fontWeight: 500,
    }}>
      <Icon d={online ? I.clock : I.wifiOff} size={16} stroke={1.75} />
      <span style={{ flex: 1, minWidth: 200 }}>
        {text}
        {!online && pending > 0 && (pending > 1
          ? ` ${pending} modifications seront envoyées au retour du réseau.`
          : ' 1 modification sera envoyée au retour du réseau.')}
        {!online && !pending && ' Les cases de tâches cochées seront envoyées au retour du réseau.'}
      </span>
      {online && pending > 0 && onRetry && (
        <button onClick={onRetry} style={{
          background: 'var(--orange-deep)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 12px', minHeight: 32,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Envoyer maintenant</button>
      )}
    </div>
  )
}
