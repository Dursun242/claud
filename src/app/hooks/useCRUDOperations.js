'use client'
import { useState, useCallback } from 'react'
import { supabaseService } from '../services/supabaseService'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook pour les opérations CRUD (Create, Read, Update, Delete)
 * Gère loading, erreurs, et affiche des toasts automatiquement
 */
export function useCRUDOperations() {
  const { addToast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const upsert = useCallback(async (type, data, onSuccess) => {
    setIsLoading(true)
    try {
      let result
      switch (type) {
        case 'chantier':
          result = await supabaseService.upsertChantier(data)
          addToast(data.id ? 'Chantier mis à jour' : 'Chantier créé', 'success')
          break
        case 'contact':
          result = await supabaseService.upsertContact(data)
          addToast(data.id ? 'Contact mis à jour' : 'Contact créé', 'success')
          break
        case 'task':
          result = await supabaseService.upsertTask(data)
          addToast(data.id ? 'Tâche mise à jour' : 'Tâche créée', 'success')
          break
        case 'cr':
          result = await supabaseService.upsertCR(data)
          addToast(data.id ? 'CR mis à jour' : 'CR créé', 'success')
          break
        case 'os':
          result = await supabaseService.upsertOS(data)
          addToast(data.id ? 'OS mis à jour' : 'OS créé', 'success')
          break
        default:
          throw new Error(`Type d'entité inconnu: ${type}`)
      }
      if (onSuccess) onSuccess()
      return result
    } catch (err) {
      console.error(`Erreur ${type}:`, err)
      addToast(`Erreur: ${err.message}`, 'error')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  const delete_ = useCallback(async (type, id, onSuccess) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet élément?')) return
    setIsLoading(true)
    try {
      switch (type) {
        case 'chantier':
          await supabaseService.deleteChantier(id)
          addToast('Chantier supprimé', 'success')
          break
        case 'contact':
          await supabaseService.deleteContact(id)
          addToast('Contact supprimé', 'success')
          break
        case 'task':
          await supabaseService.deleteTask(id)
          addToast('Tâche supprimée', 'success')
          break
        case 'cr':
          await supabaseService.deleteCR(id)
          addToast('CR supprimé', 'success')
          break
        case 'os':
          await supabaseService.deleteOS(id)
          addToast('OS supprimé', 'success')
          break
        default:
          throw new Error(`Type d'entité inconnu: ${type}`)
      }
      if (onSuccess) onSuccess()
    } catch (err) {
      console.error(`Erreur suppression ${type}:`, err)
      addToast(`Erreur: ${err.message}`, 'error')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [addToast])

  return { isLoading, upsert, delete: delete_ }
}
