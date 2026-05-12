'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'

// Composant UI pour piloter la connexion Google Tasks :
//  - GET /api/google-tasks/status au mount
//  - bouton "Connecter" → fetch /connect → redirige sur l'URL Google
//  - bouton "Déconnecter" → DELETE /status (confirm avant)
//  - lit ?google_tasks=connected|error|csrf au retour OAuth pour
//    afficher un toast.
//
// Mono-compte (Dursun) : il n'y a qu'un état global, pas de per-user.

async function callApi(path, { method = 'GET' } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${session?.access_token || ''}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Erreur serveur')
  return json
}

export default function GoogleTasksConnect() {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [status, setStatus] = useState(null)   // null = loading, { connected: bool, ... } sinon
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await callApi('/api/google-tasks/status')
      setStatus(data)
    } catch (err) {
      console.error('[GoogleTasksConnect] status', err)
      setStatus({ connected: false, error: err.message })
    }
  }, [])

  // Toast sur retour OAuth (query ?google_tasks=...).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const flag = params.get('google_tasks')
    if (!flag) return
    const messages = {
      connected: { label: 'Google Tasks connecté', type: 'success' },
      error: { label: 'Connexion Google Tasks échouée', type: 'error' },
      csrf: { label: 'Erreur sécurité (state mismatch), réessaie', type: 'error' },
      'no-refresh-token': { label: 'Google n\'a pas renvoyé de refresh token. Révoque l\'accès dans ton compte Google puis réessaie.', type: 'warning' },
    }
    const msg = messages[flag] || { label: 'État inconnu: ' + flag, type: 'warning' }
    addToast(msg.label, msg.type)

    // Nettoie l'URL pour ne pas re-afficher le toast au refresh.
    params.delete('google_tasks')
    const url = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash
    window.history.replaceState({}, '', url)
  }, [addToast])

  useEffect(() => { refresh() }, [refresh])

  const handleConnect = async () => {
    setBusy(true)
    try {
      const { url } = await callApi('/api/google-tasks/connect')
      // Top-level navigation pour que le callback puisse poser/lire le cookie HttpOnly.
      window.location.href = url
    } catch (err) {
      addToast(err.message || 'Erreur', 'error')
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Déconnecter Google Tasks ?',
      message: 'La synchronisation s\'arrêtera. Les tâches déjà créées des deux côtés resteront en place, mais ne seront plus mises à jour.',
      confirmLabel: 'Déconnecter',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await callApi('/api/google-tasks/status', { method: 'DELETE' })
      addToast('Google Tasks déconnecté', 'success')
      await refresh()
    } catch (err) {
      addToast(err.message || 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (status == null) {
    return <div style={{ fontSize: 13, color: '#64748B' }}>Chargement…</div>
  }

  if (!status.connected) {
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
          Synchronise ta To Do list ID Maîtrise avec ton Google Tasks (liste dédiée <strong>ID Maîtrise</strong>). Les tâches créées, modifiées ou cochées d&apos;un côté apparaissent automatiquement de l&apos;autre.
        </p>
        <button
          onClick={handleConnect}
          disabled={busy}
          style={{
            background: '#1E3A5F', color: '#fff', border: 'none',
            padding: '10px 18px', borderRadius: 8, fontWeight: 600,
            fontSize: 13, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Redirection…' : 'Connecter Google Tasks'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
          background: '#10B981',
        }} />
        <strong style={{ fontSize: 13 }}>Connecté</strong>
        {status.email && <span style={{ fontSize: 12, color: '#64748B' }}>en tant que {status.email}</span>}
      </div>

      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7, marginBottom: 12 }}>
        {status.connectedAt && <div>Connecté le {new Date(status.connectedAt).toLocaleString('fr-FR')}</div>}
        {status.lastFullSyncAt
          ? <div>Dernière sync: {new Date(status.lastFullSyncAt).toLocaleString('fr-FR')}</div>
          : <div>Aucune sync effectuée pour le moment</div>}
        {status.lastSyncError && (
          <div style={{ color: '#DC2626', marginTop: 4 }}>
            Dernière erreur : {status.lastSyncError}
          </div>
        )}
      </div>

      <button
        onClick={handleDisconnect}
        disabled={busy}
        style={{
          background: '#fff', color: '#DC2626', border: '1.5px solid #FECACA',
          padding: '8px 14px', borderRadius: 8, fontWeight: 600,
          fontSize: 12, cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '…' : 'Déconnecter'}
      </button>
    </div>
  )
}
