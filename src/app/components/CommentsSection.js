'use client'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'

// Temps relatif en français (sans lib externe)
function formatRelative(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `il y a ${diffD} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Palette de couleurs déterministes par nom (stable entre renders)
const AVATAR_COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6','#F97316','#6366F1']
function hashColor(name) {
  const s = name || 'x'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
}

/**
 * Composant CommentsSection
 * Affiche et gère les commentaires pour un élément
 * (utilisé dans CR, OS, Chantiers, etc)
 */
export default function CommentsSection({
  comments = [],
  onAddComment,
  onDeleteComment,
  currentUser,
  userRole,
}) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!newComment.trim()) { addToast('Veuillez entrer un commentaire', 'warning'); return }
    setSubmitting(true)
    try {
      await onAddComment(newComment)
      setNewComment('')
      addToast('Commentaire ajouté', 'success')
    } catch (err) {
      console.error('Erreur ajout commentaire:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId) => {
    const ok = await confirm({
      title: 'Supprimer ce commentaire ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    try {
      await onDeleteComment(commentId)
      addToast('Commentaire supprimé', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  // Tri du plus récent au plus ancien (copie pour ne pas muter la prop)
  const sorted = [...comments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
        💬 Commentaires <span style={{ color: '#94A3B8', fontWeight: 500 }}>({comments.length})</span>
      </h4>

      {/* Liste commentaires */}
      {sorted.length === 0 ? (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '18px 12px', textAlign: 'center', marginBottom: 12, color: '#94A3B8', fontSize: 12 }}>
          Aucun commentaire pour l&apos;instant
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {sorted.map((comment) => {
            const canDelete = userRole === 'admin' || userRole === 'salarie' || comment.author_email === currentUser?.email
            const color = hashColor(comment.author_name)
            return (
              <div
                key={comment.id}
                style={{
                  background: '#F8FAFC',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 8,
                  fontSize: 12,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar avec initiales */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: color + '22', color: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  border: `1px solid ${color}33`,
                }}>{getInitials(comment.author_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, gap: 8 }}>
                    <strong style={{ color: '#0F172A', fontSize: 12 }}>{comment.author_name || 'Anonyme'}</strong>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatRelative(comment.created_at)}</span>
                  </div>
                  <p style={{ margin: '0 0 0 0', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {comment.content}
                  </p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    aria-label="Supprimer le commentaire"
                    title="Supprimer"
                    style={{
                      background: '#fff',
                      border: '1px solid #FECACA',
                      borderRadius: 5,
                      color: '#DC2626',
                      cursor: 'pointer',
                      fontSize: 10,
                      padding: '3px 6px',
                      flexShrink: 0,
                      fontFamily: 'inherit',
                    }}
                  >✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Ajout commentaire */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Entrée pour envoyer rapidement
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit() }
          }}
          placeholder="Ajouter un commentaire…  (Cmd+Entrée pour envoyer)"
          disabled={submitting}
          style={{
            flex: 1,
            padding: 8,
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 56,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
          style={{
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            cursor: (submitting || !newComment.trim()) ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: (submitting || !newComment.trim()) ? 0.5 : 1,
            fontFamily: 'inherit',
            alignSelf: 'flex-end',
          }}
        >
          {submitting ? '…' : 'Envoyer'}
        </button>
      </div>
    </div>
  )
}
