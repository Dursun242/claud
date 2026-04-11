'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * useUndoableDelete — pattern "delete with undo" façon Gmail.
 *
 * Au lieu de supprimer immédiatement, on :
 * 1. Cache visuellement l'élément (l'ajoute à pendingIds)
 * 2. Affiche un toast "Supprimé · Annuler" pendant N secondes
 * 3. Au bout de N secondes, commit le delete (appel DB)
 * 4. Si l'utilisateur clique Annuler avant : annule le timeout,
 *    retire de pendingIds, l'item réapparaît
 *
 * Usage :
 *   const { pendingIds, scheduleDelete } = useUndoableDelete({
 *     label: 'Tâche',  // label générique
 *     onConfirmDelete: async (task) => {
 *       await SB.deleteTask(task.id)
 *       reload()
 *     },
 *   })
 *
 *   const handleDelete = async (task) => {
 *     const ok = await confirm({ ... })
 *     if (!ok) return
 *     scheduleDelete(task, { itemLabel: task.titre })
 *   }
 *
 *   // Dans le rendu de la liste :
 *   filteredTasks.filter(t => !pendingIds.has(t.id)).map(...)
 */
export function useUndoableDelete({ label = 'Élément', onConfirmDelete, delay = 5000 } = {}) {
  const { addToast } = useToast()
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const timeoutsRef = useRef(new Map())

  // Callback ref pour éviter la closure stale sur onConfirmDelete
  const onConfirmDeleteRef = useRef(onConfirmDelete)
  useEffect(() => { onConfirmDeleteRef.current = onConfirmDelete })

  const removeFromPending = useCallback((id) => {
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const scheduleDelete = useCallback((item, options = {}) => {
    if (!item || item.id == null) return
    const id = item.id
    const itemLabel = options.itemLabel || label

    // Marque l'item comme pending (visuel immédiat : l'item disparaît de la liste)
    setPendingIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    // Fonction undo : annule le timeout et fait réapparaître l'item
    const undo = () => {
      const t = timeoutsRef.current.get(id)
      if (t) clearTimeout(t)
      timeoutsRef.current.delete(id)
      removeFromPending(id)
    }

    // Programme la suppression effective après `delay` ms
    const timeoutId = setTimeout(async () => {
      timeoutsRef.current.delete(id)
      try {
        await onConfirmDeleteRef.current?.(item)
        // Note : on ne retire PAS de pendingIds ici tout de suite —
        // le reload() déclenché par onConfirmDelete va enlever l'item
        // de data.xxx et donc plus besoin de le filtrer.
        // Mais par sécurité on le retire après un petit délai au cas où
        // le reload prendrait du temps.
        setTimeout(() => removeFromPending(id), 500)
      } catch (err) {
        // Échec : on retire de pendingIds pour que l'item réapparaisse
        // et on notifie l'erreur
        removeFromPending(id)
        addToast('Erreur : ' + (err?.message || 'suppression impossible'), 'error')
      }
    }, delay)
    timeoutsRef.current.set(id, timeoutId)

    // Toast "Supprimé · Annuler" pendant toute la fenêtre d'undo
    addToast(`${itemLabel} supprimé`, 'success', {
      duration: delay,
      action: { label: 'Annuler', onClick: undo },
    })
  }, [addToast, label, delay, removeFromPending])

  // Cleanup : si le composant se démonte pendant un undo en cours,
  // on commit immédiatement les deletes pending (pour ne pas laisser
  // des items zombies en DB)
  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      // On laisse les timeouts en cours finir leur boulot — ils
      // référencent onConfirmDeleteRef.current qui reste valide
      // car le ref survit au démontage. Mais pour éviter les
      // updates d'état sur un composant démonté, on vide juste
      // la map.
      timeouts.clear()
    }
  }, [])

  return { pendingIds, scheduleDelete }
}
