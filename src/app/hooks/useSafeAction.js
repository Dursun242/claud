'use client'
import { useCallback } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * Hook useSafeAction — exécute une fonction async en attrapant les erreurs
 * pour les rendre visibles à l'utilisateur via un toast d'erreur.
 *
 * Avant : les composants client faisaient `try { ... } catch (err) {
 * console.error(err) }` — l'erreur partait dans la console sans aucun
 * retour visible. Upload qui rate, recherche qui plante, formulaire qui
 * ne sauvegarde pas : tout disparaissait silencieusement.
 *
 * Usage :
 *   const safe = useSafeAction()
 *   await safe(() => apiCall(), "Échec de l'upload")
 *
 * En cas d'erreur :
 * - console.error (pour le debug technique)
 * - toast d'erreur avec le label + le message d'erreur (5 s)
 * - retourne null
 *
 * En succès : retourne la valeur renvoyée par la fonction.
 *
 * Note : à utiliser au point le plus haut (composant qui appelle),
 * pas en chaîne. Sinon double toast.
 */
export function useSafeAction() {
  const { addToast } = useToast()

  return useCallback(async (fn, errorLabel = 'Une erreur est survenue') => {
    try {
      return await fn()
    } catch (err) {
      console.error(`[${errorLabel}]`, err)
      const detail = err?.message || String(err)
      addToast(`${errorLabel} : ${detail}`, 'error', 5000)
      return null
    }
  }, [addToast])
}
