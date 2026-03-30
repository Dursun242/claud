'use client'
import { useState } from 'react'
import { usePlans, useUploadPlan, useDeletePlan } from '../hooksPlansPhotos'
import { useToast } from '../contexts/ToastContext'

export default function PlansV({ data, user, m }) {
  const { addToast } = useToast()
  const [selectedChantier, setSelectedChantier] = useState(data.chantiers[0]?.id || null)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('plan')
  const plansQuery = usePlans(selectedChantier)
  const uploadMutation = useUploadPlan()
  const deleteMutation = useDeletePlan()

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedChantier || !user) return

    try {
      await uploadMutation.mutateAsync({
        file,
        chantier_id: selectedChantier,
        type: fileType,
        user_id: user.id,
        prenom: user.user_metadata?.prenom || user.email,
      })
      addToast('Plan téléchargé avec succès', 'success')
      setFileName('')
      setFileType('plan')
    } catch (err) {
      console.error('Erreur upload:', err)
      addToast('Erreur lors du téléchargement', 'error')
    }
  }

  const handleDelete = async (plan) => {
    if (!confirm('Supprimer ce plan ?')) return
    try {
      await deleteMutation.mutateAsync(plan)
      addToast('Plan supprimé avec succès', 'success')
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur lors de la suppression', 'error')
    }
  }

  const getFileIcon = (type) => {
    const icons = {
      plan: '📐',
      devis: '💰',
      schema: '🔧',
      'photo-avant': '📸',
      'photo-pendant': '📷',
      'photo-apres': '✨',
    }
    return icons[type] || '📄'
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h1 style={{ color: '#E2E8F0', marginBottom: '20px' }}>📐 Gestion des Plans</h1>

      {/* Sélection chantier */}
      <div style={{ background: '#1E293B', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
        <label style={{ color: '#94A3B8', display: 'block', marginBottom: '8px' }}>Sélectionner un chantier:</label>
        <select
          value={selectedChantier || ''}
          onChange={(e) => setSelectedChantier(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#0F172A',
            color: '#E2E8F0',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {data.chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      {/* Upload zone */}
      <div style={{ background: '#1E293B', padding: '20px', borderRadius: '6px', marginBottom: '20px', border: '2px dashed #334155' }}>
        <h2 style={{ color: '#94A3B8', fontSize: '14px', marginTop: 0 }}>📤 Ajouter un plan</h2>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: m ? 'wrap' : 'nowrap' }}>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            style={{
              padding: '8px',
              background: '#0F172A',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: '4px',
              fontSize: '13px',
              flex: m ? '1' : '0 1 150px',
            }}
          >
            <option value="plan">Plan</option>
            <option value="devis">Devis</option>
            <option value="schema">Schéma</option>
            <option value="photo-avant">Photo avant</option>
            <option value="photo-pendant">Photo pendant</option>
            <option value="photo-apres">Photo après</option>
          </select>

          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileUpload}
            disabled={uploadMutation.isPending}
            style={{
              padding: '8px',
              background: '#0F172A',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: '4px',
              fontSize: '13px',
              flex: 1,
              cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
            }}
          />
        </div>

        {uploadMutation.isPending && <p style={{ color: '#60A5FA', fontSize: '12px' }}>⏳ Téléchargement en cours...</p>}
        {uploadMutation.isError && <p style={{ color: '#EF4444', fontSize: '12px' }}>❌ Erreur lors du téléchargement</p>}
      </div>

      {/* Liste des plans */}
      {selectedChantier && (
        <div style={{ background: '#1E293B', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ background: '#0F172A', padding: '12px 15px', borderBottom: '1px solid #334155' }}>
            <h3 style={{ color: '#94A3B8', margin: 0, fontSize: '13px' }}>
              {plansQuery.data?.length || 0} plan(s)
            </h3>
          </div>

          {plansQuery.data && plansQuery.data.length > 0 ? (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {plansQuery.data.map((plan) => (
                <div
                  key={plan.id}
                  style={{
                    padding: '12px 15px',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#E2E8F0', margin: '0 0 4px 0', fontWeight: '500' }}>
                      {getFileIcon(plan.type)} {plan.nom}
                    </p>
                    <p style={{ color: '#64748B', margin: 0, fontSize: '12px' }}>
                      {plan.created_by_prenom} • {new Date(plan.uploaded_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(plan)}
                    disabled={deleteMutation.isPending}
                    style={{
                      padding: '6px 10px',
                      background: '#EF4444',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>
              <p>Aucun plan pour ce chantier</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
