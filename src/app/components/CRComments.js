'use client'
import { useState, useEffect } from 'react'
import { crService } from '@/app/services/crService'
import { useToast } from '@/app/contexts/ToastContext'

/**
 * Commentaires et demandes spécifiques pour CR
 * Clients peuvent ajouter commentaires/demandes
 * Admin/Salarié peuvent répondre
 */
export default function CRComments({ crId, userRole, userId, userName = 'Anonyme' }) {
  const { addToast } = useToast()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [commentType, setCommentType] = useState('commentaire')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadComments()
  }, [crId])

  const loadComments = async () => {
    setLoading(true)
    try {
      const data = await crService.getComments(crId)
      setComments(data)
    } catch (err) {
      console.error('Erreur chargement commentaires:', err)
    }
    setLoading(false)
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      addToast('Veuillez entrer un commentaire', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const comment = await crService.addComment(
        crId,
        userId,
        userRole,
        newComment,
        commentType
      )
      setComments([...comments, comment])
      addToast('Commentaire ajouté', 'success')
      setNewComment('')
      setCommentType('commentaire')
    } catch (err) {
      console.error('Erreur ajout commentaire:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResolveComment = async (commentId) => {
    try {
      await crService.updateCommentStatus(commentId, 'resolu')
      addToast('Commentaire marqué comme résolu', 'success')
      setComments(comments.map(c =>
        c.id === commentId ? { ...c, status: 'resolu' } : c
      ))
    } catch (err) {
      console.error('Erreur résolution:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Supprimer ce commentaire?')) return
    try {
      await crService.deleteComment(commentId)
      addToast('Commentaire supprimé', 'success')
      setComments(comments.filter(c => c.id !== commentId))
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const getRoleColor = (role) => {
    const colors = {
      admin: '#DC2626',
      salarie: '#2563EB',
      client: '#059669',
    }
    return colors[role] || '#6B7280'
  }

  const getRoleLabel = (role) => {
    const labels = {
      admin: '👨‍💼 Admin',
      salarie: '👷 Salarié',
      client: '🤝 Client',
    }
    return labels[role] || role
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
        💬 Commentaires & Demandes ({comments.length})
      </h4>

      {/* Formulaire ajout commentaire */}
      <div style={{
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
      }}>
        <div style={{ marginBottom: '8px' }}>
          <label style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '13px',
            marginBottom: '8px',
          }}>
            <input
              type="radio"
              value="commentaire"
              checked={commentType === 'commentaire'}
              onChange={(e) => setCommentType(e.target.value)}
            />
            💬 Commentaire
          </label>
          <label style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            fontSize: '13px',
          }}>
            <input
              type="radio"
              value="demande_specifique"
              checked={commentType === 'demande_specifique'}
              onChange={(e) => setCommentType(e.target.value)}
            />
            📋 Demande spécifique
          </label>
        </div>

        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={
            commentType === 'demande_specifique'
              ? 'Décrivez votre demande spécifique...'
              : 'Ajoutez un commentaire...'
          }
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            minHeight: '70px',
            fontFamily: 'sans-serif',
            fontSize: '13px',
            boxSizing: 'border-box',
            marginBottom: '8px',
          }}
        />

        <button
          onClick={handleAddComment}
          disabled={submitting}
          style={{
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </div>

      {/* Liste commentaires */}
      {loading ? (
        <p style={{ color: '#9CA3AF', fontSize: '13px' }}>Chargement...</p>
      ) : comments.length === 0 ? (
        <p style={{ color: '#9CA3AF', fontSize: '13px' }}>
          Aucun commentaire pour le moment
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {comments.map(comment => (
            <div
              key={comment.id}
              style={{
                background: '#FFF',
                border: `1px solid ${getRoleColor(comment.user_role)}`,
                borderLeft: `4px solid ${getRoleColor(comment.user_role)}`,
                borderRadius: '6px',
                padding: '12px',
                opacity: comment.status === 'resolu' ? 0.7 : 1,
              }}
            >
              {/* En-tête */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '8px',
              }}>
                <div>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    background: getRoleColor(comment.user_role),
                    color: '#fff',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    marginRight: '8px',
                  }}>
                    {getRoleLabel(comment.user_role)}
                  </span>
                  {comment.type === 'demande_specifique' && (
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      background: '#FCD34D',
                      color: '#92400E',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                    }}>
                      📋 Demande
                    </span>
                  )}
                  {comment.status === 'resolu' && (
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      background: '#D1FAE5',
                      color: '#047857',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginLeft: '8px',
                    }}>
                      ✅ Résolu
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                  {new Date(comment.created_at).toLocaleDateString('fr-FR')}
                </span>
              </div>

              {/* Contenu */}
              <p style={{
                margin: '8px 0',
                fontSize: '13px',
                color: '#374151',
                lineHeight: '1.5',
              }}>
                {comment.contenu}
              </p>

              {/* Actions */}
              {(userRole === 'admin' || userRole === 'salarie') && comment.status !== 'resolu' && (
                <button
                  onClick={() => handleResolveComment(comment.id)}
                  style={{
                    background: '#10B981',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  ✓ Résoudre
                </button>
              )}

              {userId === comment.user_id && (
                <button
                  onClick={() => handleDeleteComment(comment.id)}
                  style={{
                    background: '#EF4444',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginLeft: '8px',
                  }}
                >
                  🗑️ Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
