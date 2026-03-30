'use client'
import { useState, useEffect } from 'react'
import { crService } from '@/app/services/crService'
import CRTimeline from '@/app/components/CRTimeline'
import PhotoUploader from '@/app/components/PhotoUploader'
import { useToast } from '@/app/contexts/ToastContext'

/**
 * Page Comptes Rendus v3
 * Inclut:
 * - Timeline par semaine
 * - Photos intégrées
 * - Commentaires client
 * - Création/édition CR
 */
export default function CompteRendusV3({ data, reload, currentUser = null, userRole = 'admin' }) {
  const { addToast } = useToast()
  const [showNewCRForm, setShowNewCRForm] = useState(false)
  const [selectedChantier, setSelectedChantier] = useState(data?.chantiers?.[0]?.id)
  const crs = data?.compteRendus?.filter(cr => !selectedChantier || cr.chantier_id === selectedChantier) || []

  const handleNewCR = async (crData) => {
    try {
      await crService.upsert(
        {
          ...crData,
          chantier_id: selectedChantier,
        },
        currentUser?.id
      )
      addToast('Compte rendu créé avec succès', 'success')
      setShowNewCRForm(false)
      reload()
    } catch (err) {
      console.error('Erreur création CR:', err)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  const canEdit = userRole === 'admin' || userRole === 'salarie'
  const btnPrimary = { background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }
  const btnSecondary = { ...btnPrimary, background: '#6B7280' }

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
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <h2 style={{ margin: 0 }}>📝 Comptes Rendus</h2>

        {/* Sélecteur chantier */}
        <select
          value={selectedChantier}
          onChange={(e) => setSelectedChantier(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {data?.chantiers?.map(ch => (
            <option key={ch.id} value={ch.id}>{ch.nom}</option>
          ))}
        </select>

        {canEdit && (
          <button onClick={() => setShowNewCRForm(true)} style={btnPrimary}>
            ➕ Nouveau CR
          </button>
        )}
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedChantier && (
          <CRTimeline
            chantierId={selectedChantier}
            canEdit={canEdit}
            userId={currentUser?.id}
            userRole={userRole}
          />
        )}
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
              chantierId={selectedChantier}
              chantierName={data?.chantiers?.find(c => c.id === selectedChantier)?.nom}
              onSave={handleNewCR}
              onCancel={() => setShowNewCRForm(false)}
              currentUser={currentUser}
              addToast={addToast}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulaire Nouveau CR ───
function NewCRForm({ chantierId, chantierName, onSave, onCancel, currentUser, addToast }) {
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
      addToast('Veuillez entrer un résumé', 'warning')
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
          chantierId={chantierId}
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
