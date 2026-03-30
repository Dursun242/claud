'use client'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * Composant SharingPanel
 * Permet de partager un élément avec d'autres utilisateurs
 * (utilisé pour Chantiers, etc)
 */
export default function SharingPanel({
  shares = [],
  onAddShare,
  onDeleteShare,
  loading = false,
}) {
  const { addToast } = useToast()
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('view')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) {
      addToast('Veuillez entrer une adresse email', 'warning')
      return
    }

    setSubmitting(true)
    try {
      await onAddShare(email, permission)
      setEmail('')
      setPermission('view')
      addToast('Partagé avec ' + email, 'success')
    } catch (err) {
      console.error('Erreur partage:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (shareId) => {
    if (!window.confirm('Retirer l\'accès?')) return
    try {
      await onDeleteShare(shareId)
      addToast('Accès retiré', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const getPermissionLabel = (perm) => {
    const labels = { view: '👁️ Lecture', edit: '✏️ Édition', admin: '👨‍💼 Admin' };
    return labels[perm] || perm;
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
        🔗 Partage ({shares.length})
      </h4>

      {/* Liste partages */}
      <div style={{ marginBottom: 12 }}>
        {shares.map((share) => (
          <div
            key={share.id}
            style={{
              background: '#F8FAFC',
              borderRadius: 8,
              padding: 10,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <div>
              <strong style={{ color: '#0F172A' }}>{share.shared_with_email}</strong>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                {getPermissionLabel(share.permission)}
              </div>
            </div>
            <button
              onClick={() => handleDelete(share.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Ajouter partage */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          disabled={submitting}
          style={{
            flex: 1,
            minWidth: 150,
            padding: '8px 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        />
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value)}
          disabled={submitting}
          style={{
            padding: '8px 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="view">Lecture</option>
          <option value="edit">Édition</option>
          <option value="admin">Admin</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting || !email.trim()}
          style={{
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '...' : 'Partager'}
        </button>
      </div>
    </div>
  )
}
