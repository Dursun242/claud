'use client'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'

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
  loading = false,
}) {
  const { addToast } = useToast()
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!newComment.trim()) {
      addToast('Veuillez entrer un commentaire', 'warning')
      return
    }

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
    if (!window.confirm('Supprimer ce commentaire?')) return
    try {
      await onDeleteComment(commentId)
      addToast('Commentaire supprimé', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
        💬 Commentaires ({comments.length})
      </h4>

      {/* Liste commentaires */}
      <div style={{ marginBottom: 12 }}>
        {comments.map((comment) => (
          <div
            key={comment.id}
            style={{
              background: '#F8FAFC',
              borderRadius: 8,
              padding: 10,
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong style={{ color: '#0F172A' }}>{comment.author_name}</strong>
              {(userRole === 'admin' || userRole === 'salarie' || comment.author_email === currentUser?.email) && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  🗑️
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 4px 0', color: '#475569' }}>{comment.content}</p>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>
              {new Date(comment.created_at).toLocaleDateString('fr-FR')}
            </span>
          </div>
        ))}
      </div>

      {/* Ajout commentaire */}
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Ajouter un commentaire..."
          disabled={submitting}
          style={{
            flex: 1,
            padding: 8,
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 60,
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
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? '...' : 'Envoyer'}
        </button>
      </div>
    </div>
  )
}
