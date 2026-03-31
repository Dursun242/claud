import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook useTemplates
 * Gère les templates réutilisables (charger, créer, supprimer)
 * Supporte différents types: 'os', 'cr', 'task', etc.
 */
export function useTemplates(type) {
  const { addToast } = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)

  // Charger les templates
  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('type', type)
        .order('name')

      if (error) throw error
      setTemplates(data || [])
    } catch (err) {
      console.error('Erreur chargement templates:', err)
      addToast('Erreur chargement templates', 'error')
    }
  }

  // Charger au montage ou changement de type
  useEffect(() => {
    loadTemplates()
  }, [type])

  // Créer/sauvegarder un template
  const saveTemplate = async (name, description, data) => {
    if (!name.trim()) {
      addToast('Veuillez entrer un nom', 'warning')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('templates').insert({
        type,
        name,
        description,
        data,
      })

      if (error) throw error

      await loadTemplates()
      addToast('Template créé ✓', 'success')
    } catch (err) {
      console.error('Erreur création template:', err)
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Supprimer un template
  const deleteTemplate = async (id) => {
    if (!window.confirm('Supprimer ce template?')) return

    try {
      await supabase.from('templates').delete().eq('id', id)

      await loadTemplates()
      addToast('Template supprimé ✓', 'success')
    } catch (err) {
      console.error('Erreur suppression template:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return {
    templates,
    loading,
    saveTemplate,
    deleteTemplate,
    reload: loadTemplates,
  }
}
