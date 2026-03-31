import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook useComments
 * Gère les commentaires (ajouter, charger, supprimer)
 * Patterns réutilisables pour tous les types d'éléments
 */
export function useComments(type, itemId, currentUserEmail) {
  const { addToast } = useToast()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)

  // Charger les commentaires
  const loadComments = async () => {
    if (!itemId) return
    try {
      const colName = {
        chantier: 'chantier_id',
        os: 'os_id',
        cr: 'cr_id',
        task: 'task_id',
      }[type]

      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq(colName, itemId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setComments(data || [])
    } catch (err) {
      console.error('Erreur chargement commentaires:', err)
      addToast('Erreur chargement commentaires', 'error')
    }
  }

  // Charger au montage ou changement d'itemId
  useEffect(() => {
    loadComments()
  }, [itemId, type])

  // Ajouter un commentaire
  const addComment = async (content) => {
    if (!itemId) {
      addToast('Élément non sélectionné', 'warning')
      return
    }

    if (!content.trim()) {
      addToast('Veuillez entrer un commentaire', 'warning')
      return
    }

    setLoading(true)
    try {
      const colName = {
        chantier: 'chantier_id',
        os: 'os_id',
        cr: 'cr_id',
        task: 'task_id',
      }[type]

      const { error } = await supabase.from('comments').insert({
        [colName]: itemId,
        author_email: currentUserEmail || 'Anonyme',
        author_name: (currentUserEmail || 'Anonyme').split('@')[0],
        content,
      })

      if (error) throw error

      await loadComments()
      addToast('Commentaire ajouté ✓', 'success')
    } catch (err) {
      console.error('Erreur ajout commentaire:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Supprimer un commentaire
  const deleteComment = async (id) => {
    if (!window.confirm('Supprimer ce commentaire?')) return

    try {
      await supabase.from('comments').delete().eq('id', id)

      await loadComments()
      addToast('Commentaire supprimé ✓', 'success')
    } catch (err) {
      console.error('Erreur suppression commentaire:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return {
    comments,
    loading,
    addComment,
    deleteComment,
    reload: loadComments,
  }
}
