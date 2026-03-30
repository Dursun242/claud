import { useState, useEffect } from 'react'
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
  const loadAttachments = async () => {
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
  }

  // Charger au montage ou changement d'itemId
  useEffect(() => {
    loadAttachments()
  }, [itemId, type])

  // Upload un fichier
  const uploadAttachment = async (file) => {
    if (!itemId) {
      addToast('Élément non sélectionné', 'warning')
      return
    }

    setLoading(true)
    try {
      // Upload vers Supabase storage
      const filePath = `${type}/${itemId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Enregistrer dans la DB
      const colName = {
        chantier: 'chantier_id',
        os: 'os_id',
        cr: 'cr_id',
        task: 'task_id',
      }[type]

      const { error: dbError } = await supabase.from('attachments').insert({
        [colName]: itemId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      })

      if (dbError) throw dbError

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
