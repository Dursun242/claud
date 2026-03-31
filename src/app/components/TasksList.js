'use client'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'

/**
 * Composant TasksList
 * Example Phase 4 refactoring: Tasks avec état minimal grâce aux hooks
 *
 * Démontre:
 * - Utilisation des composants Phase 2
 * - Pas de duplication de code pour états/modales
 * - Interactions simples et déclaratives
 */
export default function TasksList({
  tasks = [],
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  loading = false,
  status,
  Badge,
  fmtDate,
}) {
  const { addToast } = useToast()
  const [expandedId, setExpandedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const handleToggleStatus = async (task) => {
    const newStatus = task.statut === 'Terminé' ? 'En attente' : 'Terminé'
    try {
      await onUpdateTask({ ...task, statut: newStatus })
      addToast(`Tâche marquée ${newStatus}`, 'success')
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Supprimer cette tâche?')) return
    try {
      await onDeleteTask(id)
      addToast('Tâche supprimée', 'success')
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const handleSaveEdit = async (task) => {
    try {
      await onUpdateTask({ ...task, ...editForm })
      setEditingId(null)
      setEditForm({})
      addToast('Tâche mise à jour', 'success')
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  if (tasks.length === 0) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: 'center',
          color: '#94A3B8',
          fontSize: 13,
        }}
      >
        Aucune tâche
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.map((task) => (
        <div
          key={task.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#fff',
            borderRadius: 8,
            padding: '10px 12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            opacity: task.statut === 'Terminé' ? 0.6 : 1,
          }}
        >
          {/* Status checkbox */}
          <button
            onClick={() => handleToggleStatus(task)}
            disabled={loading}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `2px solid ${status?.[task.statut] || '#CBD5E1'}`,
              background: task.statut === 'Terminé' ? '#10B981' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
              padding: 0,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {task.statut === 'Terminé' && '✓'}
          </button>

          {/* Content */}
          {editingId === task.id ? (
            // Edit mode
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={editForm.titre ?? task.titre}
                onChange={(e) => setEditForm({ ...editForm, titre: e.target.value })}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  border: '1px solid #3B82F6',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ) : (
            // View mode
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#0F172A',
                  textDecoration: task.statut === 'Terminé' ? 'line-through' : 'none',
                }}
              >
                {task.titre}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                {task.lot} • {fmtDate(task.echeance)}
              </div>
            </div>
          )}

          {/* Priority badge */}
          {!editingId && <Badge text={task.priorite} color={status?.[task.priorite] || '#64748B'} />}

          {/* Edit/Save buttons */}
          {editingId === task.id ? (
            <>
              <button
                onClick={() => handleSaveEdit(task)}
                disabled={loading}
                style={{
                  background: '#10B981',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                ✓ Enregistrer
              </button>
              <button
                onClick={() => {
                  setEditingId(null)
                  setEditForm({})
                }}
                style={{
                  background: '#EF4444',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                ✕ Annuler
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditingId(task.id)
                  setEditForm({ titre: task.titre })
                }}
                style={{
                  background: '#3B82F6',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                ✎
              </button>
              <button
                onClick={() => handleDeleteTask(task.id)}
                style={{
                  background: '#EF4444',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                🗑️
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
