import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook useAttachments
 * Gère les pièces jointes (upload, téléchargement, suppression)
 * Patterns réutilisables pour tous les types d'éléments (chantier, OS, CR, tâche)
 */
export function useAttachments(type, itemId) {
  const { addToast } = useToast()
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(false)

  // Charger les attachments
  const loadAttachments = useCallback(async () => {
    if (!itemId) return
    try {
      const colName = {
        chantier: 'chantier_id',
        os: 'os_id',
        cr: 'cr_id',
        task: 'task_id',
      }[type]

      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq(colName, itemId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      setAttachments(data || [])
    } catch (err) {
      console.error('Erreur chargement attachments:', err)
      addToast('Erreur chargement fichiers', 'error')
    }
  }, [itemId, type, addToast])

  // Charger au montage ou changement d'itemId
  useEffect(() => {
    loadAttachments()
  }, [loadAttachments])

  // Upload via API route serveur (évite les problèmes de policies RLS Storage)
  const uploadAttachment = async (file) => {
    if (!itemId) { addToast('Élément non sélectionné', 'warning'); return }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('type', type)
      fd.append('itemId', itemId)
      const { data: { session } } = await supabase.auth.getSession()
      const res  = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
        body: fd,
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erreur upload')
      await loadAttachments()
      addToast('Fichier uploadé ✓', 'success')
    } catch (err) {
      console.error('Upload failed:', err)
      addToast('Erreur upload: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Supprimer un attachment
  const deleteAttachment = async (id, filePath) => {
    if (!window.confirm('Supprimer ce fichier?')) return

    try {
      // Supprimer du storage
      await supabase.storage.from('attachments').remove([filePath])

      // Supprimer de la DB
      await supabase.from('attachments').delete().eq('id', id)

      await loadAttachments()
      addToast('Fichier supprimé ✓', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur suppression: ' + err.message, 'error')
    }
  }

  // Obtenir l'URL publique d'un fichier
  const getFileUrl = (filePath) => {
    const { data } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath)
    return data?.publicUrl
  }

  return {
    attachments,
    loading,
    uploadAttachment,
    deleteAttachment,
    getFileUrl,
    reload: loadAttachments,
  }
}
