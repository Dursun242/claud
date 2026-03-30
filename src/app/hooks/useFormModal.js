'use client'
import { useState, useCallback } from 'react'

/**
 * Hook pour gérer l'état des modales et des données de formulaire
 * Évite les états dupliqués dans chaque composant
 */
export function useFormModal() {
  const [state, setState] = useState({
    modal: null,
    form: {},
    isOpen: false,
  })

  const openModal = useCallback((modalName, initialData = {}) => {
    setState({
      modal: modalName,
      form: initialData,
      isOpen: true,
    })
  }, [])

  const closeModal = useCallback(() => {
    setState({
      modal: null,
      form: {},
      isOpen: false,
    })
  }, [])

  const updateForm = useCallback((updates) => {
    setState(prev => ({
      ...prev,
      form: { ...prev.form, ...updates },
    }))
  }, [])

  const resetForm = useCallback(() => {
    setState({
      modal: null,
      form: {},
      isOpen: false,
    })
  }, [])

  return {
    modal: state.modal,
    form: state.form,
    isOpen: state.isOpen,
    openModal,
    closeModal,
    updateForm,
    resetForm,
  }
}
