'use client'
// DashboardLoadState — ce qu'affiche la coque tant que les données du
// tableau de bord ne sont pas là. Jamais d'attente muette :
//   - échec du chargement → message + « Réessayer » ;
//   - pas de réseau (requête en pause, rien en cache) → squelette + avis
//     après un court délai (le cache de l'appareil peut encore arriver) ;
//   - chargement anormalement long → squelette + avis + « Réessayer ».

import { useEffect, useState } from 'react'
import { DashboardSkeleton } from './Skeleton'
import { btnP, btnS } from '../dashboards/shared'
import { isNetworkError } from '../lib/offlineStore'

export const PAUSED_NOTICE_MS = 1500
export const SLOW_NOTICE_MS = 8000

function RetryButton({ onRetry, primary }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try { await onRetry?.() } finally { setBusy(false) }
      }}
      style={{ ...(primary ? btnP : btnS), fontSize: 13, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? 'Chargement…' : 'Réessayer'}
    </button>
  )
}

export default function DashboardLoadState({ role = 'admin', error, paused, onRetry }) {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (error) return undefined
    setNotice(null)
    const t = setTimeout(() => setNotice(paused ? 'paused' : 'slow'), paused ? PAUSED_NOTICE_MS : SLOW_NOTICE_MS)
    return () => clearTimeout(t)
  }, [error, paused])

  if (error) {
    const offline = isNetworkError(error)
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F2F2F7', padding: 16, boxSizing: 'border-box',
        fontFamily: 'var(--font-dm-sans), sans-serif',
      }}>
        <div role="alert" style={{
          background: '#fff', border: '1px solid #E5E5EA', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 20, maxWidth: 400, width: '100%',
        }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1C1C1E' }}>
            Impossible de charger les chantiers
          </h1>
          <p style={{ margin: '8px 0 16px', fontSize: 13, lineHeight: 1.5, color: '#3A3A3C' }}>
            {offline
              ? 'Pas de réseau. Vérifiez la connexion, puis réessayez.'
              : 'Le serveur n\'a pas répondu correctement. Réessayez dans un instant.'}
          </p>
          <RetryButton onRetry={onRetry} primary />
        </div>
      </div>
    )
  }

  return (
    <>
      <DashboardSkeleton role={role} />
      {notice && (
        <div role="status" style={{
          position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))',
          margin: '0 auto', maxWidth: 440, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          background: '#fff', border: '1px solid #E5E5EA', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px 14px',
          fontFamily: 'var(--font-dm-sans), sans-serif', fontSize: 13, lineHeight: 1.5, color: '#3A3A3C',
        }}>
          <span>
            {notice === 'paused'
              ? 'Pas de réseau. Les chantiers s\'afficheront au retour de la connexion.'
              : 'Le chargement prend plus de temps que prévu.'}
          </span>
          <RetryButton onRetry={onRetry} />
        </div>
      )}
    </>
  )
}
