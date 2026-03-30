'use client'
import { useState, useEffect } from 'react'
import { crService } from '@/app/services/crService'
import CRTimeline from '@/app/components/CRTimeline'
import PhotoUploader from '@/app/components/PhotoUploader'

/**
 * Page Comptes Rendus v3
 * Inclut:
 * - Timeline par semaine
 * - Photos intégrées
 * - Commentaires client
 * - Création/édition CR
 */
export default function CompteRendusV3({ chantier, currentUser = null, userRole = null }) {
  const [crs, setCRs] = useState([])
  const [showNewCRForm, setShowNewCRForm] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (chantier?.id) {
      loadCRs()
    }
  }, [chantier?.id])

  const loadCRs = async () => {
    setLoading(true)
    try {
      const list = await crService.getByChantier(chantier.id)
      setCRs(list)
    } catch (err) {
      console.error('Erreur chargement CR:', err)
    }
    setLoading(false)
  }

  const handleNewCR = async (data) => {
    try {
      await crService.upsert(
        {
          ...data,
          chantier_id: chantier.id,
        },
        currentUser?.id
      )
      setShowNewCRForm(false)
      loadCRs()
    } catch (err) {
      console.error('Erreur création CR:', err)
      alert('Erreur: ' + err.message)
    }
  }

  const canEdit = userRole === 'admin' || userRole === 'salarie'
  const btnPrimary = { background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }
  const btnSecondary = { ...btnPrimary, background: '#6B7280' }

  if (loading) return <div style={{ padding: '20px', color: '#9CA3AF' }}>Chargement...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* En-tête */}
      <div style={{
        padding: '20px',
        background: '#FFF',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 style={{ margin: 0 }}>📝 Comptes Rendus</h2>
        {canEdit && (
          <button onClick={() => setShowNewCRForm(true)} style={btnPrimary}>
            ➕ Nouveau CR
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <CRTimeline
          chantierId={chantier.id}
          canEdit={canEdit}
          userId={currentUser?.id}
          userRole={userRole}
        />
      </div>

      {/* Modal nouveau CR */}
      {showNewCRForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#FFF',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h2 style={{ marginBottom: '20px' }}>Nouveau Compte Rendu</h2>

            <NewCRForm
              chantier={chantier}
              onSave={handleNewCR}
              onCancel={() => setShowNewCRForm(false)}
              currentUser={currentUser}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulaire Nouveau CR ───
function NewCRForm({ chantier, onSave, onCancel, currentUser }) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    numero: Math.floor(Math.random() * 10000),
    resume: '',
    participants: '',
    decisions: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!formData.resume) {
      alert('Veuillez entrer un résumé')
      return
    }
    setSaving(true)
    try {
      await onSave(formData)
    } finally {
      setSaving(false)
    }
  }

  const btnPrimary = { background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }
  const btnSecondary = { ...btnPrimary, background: '#6B7280' }

  return (
    <div>
      {/* Date */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
          Date
        </label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Numéro */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
          Numéro
        </label>
        <input
          type="number"
          value={formData.numero}
          onChange={(e) => setFormData({ ...formData, numero: parseInt(e.target.value) })}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Résumé */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
          Résumé *
        </label>
        <textarea
          value={formData.resume}
          onChange={(e) => setFormData({ ...formData, resume: e.target.value })}
          placeholder="Décrivez les travaux effectués..."
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            minHeight: '100px',
            fontFamily: 'sans-serif',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Participants */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
          Participants
        </label>
        <input
          type="text"
          value={formData.participants}
          onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
          placeholder="Noms des participants"
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Décisions */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>
          Décisions
        </label>
        <textarea
          value={formData.decisions}
          onChange={(e) => setFormData({ ...formData, decisions: e.target.value })}
          placeholder="Les décisions prises..."
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            minHeight: '100px',
            fontFamily: 'sans-serif',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Uploader photos */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
          Ajouter des photos
        </label>
        <PhotoUploader
          chantierId={chantier.id}
          userId={currentUser?.id}
        />
      </div>

      {/* Boutons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnSecondary} disabled={saving}>
          Annuler
        </button>
        <button onClick={handleSubmit} style={btnPrimary} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
