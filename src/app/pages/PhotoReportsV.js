'use client'
import { useState } from 'react'
import { usePhotoReports, useCreatePhotoReport, usePhotos, useUploadPhoto, useDeletePhoto, useDeletePhotoReport } from '../hooksPlansPhotos'
import { useToast } from '../contexts/ToastContext'

export default function PhotoReportsV({ data, user, m }) {
  const { addToast } = useToast()
  const [selectedChantier, setSelectedChantier] = useState(data.chantiers[0]?.id || null)
  const [showNewReport, setShowNewReport] = useState(false)
  const [reportName, setReportName] = useState('')
  const [reportDesc, setReportDesc] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)
  const [uploadedFiles, setUploadedFiles] = useState([])

  const reportsQuery = usePhotoReports(selectedChantier)
  const createReportMutation = useCreatePhotoReport()
  const photosQuery = usePhotos(selectedReport)
  const uploadPhotoMutation = useUploadPhoto()
  const deletePhotoMutation = useDeletePhoto()
  const deleteReportMutation = useDeletePhotoReport()

  const handleCreateReport = async () => {
    if (!reportName.trim() || !selectedChantier || !user) return

    try {
      const newReport = await createReportMutation.mutateAsync({
        chantier_id: selectedChantier,
        nom: reportName,
        description: reportDesc,
        user_id: user.id,
        prenom: user.user_metadata?.prenom || user.email,
      })

      setSelectedReport(newReport.id)
      setReportName('')
      addToast('Reportage créé avec succès', 'success')
      setReportDesc('')
      setShowNewReport(false)
    } catch (err) {
      console.error('Erreur création reportage:', err)
      addToast('Erreur lors de la création', 'error')
    }
  }

  const handleUploadPhotos = async (files) => {
    if (!selectedReport || !user) return

    const uploadedPhotos = []
    for (const file of files) {
      try {
        const photo = await uploadPhotoMutation.mutateAsync({
          file,
          report_id: selectedReport,
          user_id: user.id,
          prenom: user.user_metadata?.prenom || user.email,
          position: uploadedPhotos.length,
        })
        uploadedPhotos.push(photo)
      } catch (err) {
        console.error('Erreur upload photo:', err)
      }
    }
    setUploadedFiles([])
  }

  const handleDeleteReport = async (report) => {
    if (!confirm(`Supprimer le reportage "${report.nom}" et toutes ses photos ?`)) return
    try {
      await deleteReportMutation.mutateAsync(report)
      addToast('Reportage supprimé avec succès', 'success')
      setSelectedReport(null)
    } catch (err) {
      console.error('Erreur suppression:', err)
      addToast('Erreur lors de la suppression', 'error')
    }
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease', display: 'grid', gridTemplateColumns: m ? '1fr' : '250px 1fr', gap: '20px' }}>
      {/* Liste des reportages */}
      <div style={{ background: '#1E293B', borderRadius: '6px', overflow: 'hidden', height: 'fit-content', gridColumn: m ? '1' : '1' }}>
        <div style={{ background: '#0F172A', padding: '15px', borderBottom: '1px solid #334155' }}>
          <select
            value={selectedChantier || ''}
            onChange={(e) => {
              setSelectedChantier(e.target.value)
              setSelectedReport(null)
            }}
            style={{
              width: '100%',
              padding: '8px',
              background: '#0F172A',
              color: '#E2E8F0',
              border: '1px solid #334155',
              borderRadius: '4px',
              fontSize: '13px',
              marginBottom: '10px',
            }}
          >
            {data.chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowNewReport(!showNewReport)}
            style={{
              width: '100%',
              padding: '8px',
              background: '#3B82F6',
              color: '#FFF',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
            {showNewReport ? '✕ Annuler' : '+ Nouveau reportage'}
          </button>
        </div>

        {showNewReport && (
          <div style={{ padding: '12px', borderBottom: '1px solid #334155' }}>
            <input
              type="text"
              placeholder="Nom du reportage"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#0F172A',
                color: '#E2E8F0',
                border: '1px solid #334155',
                borderRadius: '3px',
                fontSize: '12px',
                marginBottom: '6px',
                boxSizing: 'border-box',
              }}
            />
            <textarea
              placeholder="Description (optionnel)"
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#0F172A',
                color: '#E2E8F0',
                border: '1px solid #334155',
                borderRadius: '3px',
                fontSize: '12px',
                marginBottom: '6px',
                boxSizing: 'border-box',
                minHeight: '60px',
              }}
            />
            <button
              onClick={handleCreateReport}
              disabled={createReportMutation.isPending}
              style={{
                width: '100%',
                padding: '6px',
                background: '#10B981',
                color: '#FFF',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Créer
            </button>
          </div>
        )}

        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {reportsQuery.data && reportsQuery.data.length > 0 ? (
            reportsQuery.data.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: selectedReport === report.id ? '#334155' : 'transparent',
                  color: '#E2E8F0',
                  border: 'none',
                  borderBottom: '1px solid #334155',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: '500', marginBottom: '2px' }}>{report.nom}</div>
                <div style={{ color: '#64748B', fontSize: '11px' }}>{report.created_by_prenom}</div>
              </button>
            ))
          ) : (
            <div style={{ padding: '12px', color: '#64748B', fontSize: '12px', textAlign: 'center' }}>
              Aucun reportage
            </div>
          )}
        </div>
      </div>

      {/* Détail du reportage */}
      <div>
        {selectedReport && photosQuery.data !== undefined ? (
          <div style={{ background: '#1E293B', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#0F172A', padding: '15px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: '#E2E8F0', margin: 0 }}>
                📸 {reportsQuery.data?.find((r) => r.id === selectedReport)?.nom}
              </h2>
              <button
                onClick={() => handleDeleteReport(reportsQuery.data?.find((r) => r.id === selectedReport))}
                style={{
                  padding: '6px 10px',
                  background: '#EF4444',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                🗑️
              </button>
            </div>

            {/* Upload zone */}
            <div style={{ padding: '15px', borderBottom: '1px solid #334155', background: '#0F172A' }}>
              <label style={{ display: 'block', color: '#94A3B8', marginBottom: '8px', fontSize: '13px' }}>
                📤 Ajouter des photos
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleUploadPhotos(Array.from(e.target.files))
                  }
                }}
                disabled={uploadPhotoMutation.isPending}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#1E293B',
                  color: '#E2E8F0',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  fontSize: '13px',
                  cursor: uploadPhotoMutation.isPending ? 'not-allowed' : 'pointer',
                }}
              />
              {uploadPhotoMutation.isPending && (
                <p style={{ color: '#60A5FA', fontSize: '12px', marginTop: '8px' }}>⏳ Téléchargement...</p>
              )}
            </div>

            {/* Galerie photos */}
            <div style={{ padding: '15px' }}>
              {photosQuery.data && photosQuery.data.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                  {photosQuery.data.map((photo) => (
                    <div
                      key={photo.id}
                      style={{
                        position: 'relative',
                        paddingBottom: '100%',
                        background: '#0F172A',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid #334155',
                      }}
                    >
                      <img
                        src={photo.file_path}
                        alt="Photo"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <button
                        onClick={() => deletePhotoMutation.mutate(photo)}
                        style={{
                          position: 'absolute',
                          top: '5px',
                          right: '5px',
                          width: '24px',
                          height: '24px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748B', padding: '20px' }}>
                  Aucune photo pour ce reportage
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: '#1E293B', padding: '30px', borderRadius: '6px', textAlign: 'center', color: '#64748B' }}>
            Sélectionnez un reportage pour voir les photos
          </div>
        )}
      </div>
    </div>
  )
}
