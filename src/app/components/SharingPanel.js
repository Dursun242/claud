'use client'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'

const PERMISSIONS = {
  view:  { label: '👁 Lecture',  color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  edit:  { label: '✏ Édition',   color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  admin: { label: '👨‍💼 Admin',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
}

function getInitials(email) {
  if (!email) return '?'
  const local = email.split('@')[0]
  return local.slice(0, 2).toUpperCase()
}

/**
 * Composant SharingPanel
 * Permet de partager un élément avec d'autres utilisateurs
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
    const e = email.trim()
    if (!e) { addToast('Veuillez entrer une adresse email', 'warning'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      addToast("Format d'email invalide", 'warning')
      return
    }
    setSubmitting(true)
    try {
      await onAddShare(e, permission)
      setEmail('')
      setPermission('view')
      addToast('Partagé avec ' + e, 'success')
    } catch (err) {
      console.error('Erreur partage:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (share) => {
    if (!window.confirm(`Retirer l'accès de ${share.shared_with_email} ?`)) return
    try {
      await onDeleteShare(share.id)
      addToast('Accès retiré', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
        🔗 Partage <span style={{ color: '#94A3B8', fontWeight: 500 }}>({shares.length})</span>
      </h4>

      {/* Liste partages */}
      {shares.length === 0 ? (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '18px 12px', textAlign: 'center', marginBottom: 12, color: '#94A3B8', fontSize: 12 }}>
          Aucun partage pour l&apos;instant
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {shares.map((share) => {
            const perm = PERMISSIONS[share.permission] || PERMISSIONS.view
            return (
              <div
                key={share.id}
                style={{
                  background: '#F8FAFC',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: perm.bg, color: perm.color,
                  border: `1px solid ${perm.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>{getInitials(share.shared_with_email)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#0F172A', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {share.shared_with_email}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      fontSize: 9, fontWeight: 700,
                      background: perm.bg, color: perm.color,
                      border: `1px solid ${perm.border}`,
                      padding: '2px 6px', borderRadius: 999,
                    }}>{perm.label}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(share)}
                  aria-label={`Retirer l'accès de ${share.shared_with_email}`}
                  title="Retirer l'accès"
                  style={{
                    background: '#fff',
                    border: '1px solid #FECACA',
                    borderRadius: 5,
                    color: '#DC2626',
                    cursor: 'pointer',
                    fontSize: 10,
                    padding: '4px 7px',
                    flexShrink: 0,
                    fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Ajouter partage */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="email@exemple.com"
          disabled={submitting}
          style={{
            flex: 1,
            minWidth: 150,
            padding: '8px 12px',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            outline: 'none',
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
            background: '#fff',
          }}
        >
          <option value="view">👁 Lecture</option>
          <option value="edit">✏ Édition</option>
          <option value="admin">👨‍💼 Admin</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting || !email.trim()}
          style={{
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            cursor: (submitting || !email.trim()) ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: (submitting || !email.trim()) ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          {submitting ? '…' : 'Partager'}
        </button>
      </div>
    </div>
  )
}
