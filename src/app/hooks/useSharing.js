import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook useSharing
 * Gère le partage d'éléments (ajout de partages, suppression, chargement)
 * Basé sur le système de sharing par email et permissions (view, edit, admin)
 */
export function useSharing(itemId) {
  const { addToast } = useToast()
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(false)

  // Charger les partages
  const loadShares = useCallback(async () => {
    if (!itemId) return
    try {
      const { data, error } = await supabase
        .from('sharing')
        .select('*')
        .eq('chantier_id', itemId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setShares(data || [])
    } catch (err) {
      console.error('Erreur chargement partages:', err)
      addToast('Erreur chargement partages', 'error')
    }
  }, [itemId, addToast])

  // Charger au montage ou changement d'itemId
  useEffect(() => {
    loadShares()
  }, [loadShares])

  // Ajouter un partage
  const addShare = async (email, permission = 'view') => {
    if (!itemId) {
      addToast('Élément non sélectionné', 'warning')
      return
    }

    if (!email.trim()) {
      addToast('Veuillez entrer une adresse email', 'warning')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('sharing').insert({
        chantier_id: itemId,
        shared_with_email: email.toLowerCase().trim(),
        permission,
      })

      if (error) throw error

      await loadShares()
      addToast(`Partagé avec ${email} ✓`, 'success')
    } catch (err) {
      console.error('Erreur partage:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Supprimer un partage
  const deleteShare = async (id) => {
    if (!window.confirm('Retirer cet accès?')) return

    try {
      await supabase.from('sharing').delete().eq('id', id)

      await loadShares()
      addToast('Accès retiré ✓', 'success')
    } catch (err) {
      console.error('Erreur suppression partage:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return {
    shares,
    loading,
    addShare,
    deleteShare,
    reload: loadShares,
  }
}
