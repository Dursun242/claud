import { useState } from 'react'

/**
 * Hook useDetailView
 * Gère l'état de la vue détail (modal, formulaire)
 * Patterns: sélection d'élément, modal détail, form data
 * Utilisé pour TasksV, ProjectsV, ContactsV, etc.
 */
export function useDetailView() {
  const [selectedId, setSelectedId] = useState(null)
  const [detailModal, setDetailModal] = useState(null)
  const [detailForm, setDetailForm] = useState({})

  // Ouvrir la vue détail
  const openDetail = (id) => {
    setSelectedId(id)
  }

  // Fermer la vue détail
  const closeDetail = () => {
    setSelectedId(null)
    setDetailModal(null)
    setDetailForm({})
  }

  // Ouvrir un modal détail
  const openDetailModal = (modalName, initialForm = {}) => {
    setDetailModal(modalName)
    setDetailForm(initialForm)
  }

  // Fermer le modal détail
  const closeDetailModal = () => {
    setDetailModal(null)
    setDetailForm({})
  }

  // Mettre à jour le formulaire
  const updateDetailForm = (updates) => {
    setDetailForm((prev) => ({ ...prev, ...updates }))
  }

  // Réinitialiser le formulaire
  const resetDetailForm = (initial = {}) => {
    setDetailForm(initial)
  }

  return {
    // État
    selectedId,
    detailModal,
    detailForm,

    // Actions
    openDetail,
    closeDetail,
    openDetailModal,
    closeDetailModal,
    updateDetailForm,
    resetDetailForm,
  }
}
