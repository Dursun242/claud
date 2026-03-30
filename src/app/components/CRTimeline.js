'use client'
import { useState, useEffect } from 'react'
import { crService } from '@/app/services/crService'

/**
 * Timeline des Comptes Rendus par semaine
 * Semaine par semaine, avec photos et commentaires
 */
export default function CRTimeline({ chantierId, canEdit = false, userId = null, userRole = null }) {
  const [crs, setCRs] = useState([])
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadCRs()
  }, [chantierId])

  const loadCRs = async () => {
    setLoading(true)
    try {
      const data = await crService.getByChantier(chantierId)
      setCRs(data)
      if (!selectedWeek && data.length > 0) {
        setSelectedWeek(data[0].semaine)
      }
    } catch (err) {
      console.error('Erreur chargement CR:', err)
    }
    setLoading(false)
  }

  const weeks = [...new Set(crs.map(cr => cr.semaine))].sort((a, b) => b - a)
  const crThisWeek = selectedWeek ? crs.filter(cr => cr.semaine === selectedWeek) : []

  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
      {/* Sidebar: Semaines */}
      <div style={{
        width: '200px',
        background: '#F9FAFB',
        borderRight: '1px solid #E5E7EB',
        padding: '16px',
        overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Semaines</h3>
        {weeks.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Aucun CR</p>
        ) : (
          weeks.map(week => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '8px',
                background: selectedWeek === week ? '#3B82F6' : '#FFF',
                color: selectedWeek === week ? '#FFF' : '#000',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              Semaine {week}
            </button>
          ))
        )}
      </div>

      {/* Main: CR pour la semaine sélectionnée */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {selectedWeek && (
          <>
            <h2 style={{ marginBottom: '16px' }}>Semaine {selectedWeek}</h2>
            {crThisWeek.length === 0 ? (
              <p style={{ color: '#9CA3AF' }}>Aucun CR pour cette semaine</p>
            ) : (
              crThisWeek.map(cr => (
                <div
                  key={cr.id}
                  style={{
                    background: '#FFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                  }}
                >
                  {/* En-tête */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
                      CR #{cr.numero} — {new Date(cr.date).toLocaleDateString('fr-FR')}
                    </h3>
                    {canEdit && (
                      <button style={{
                        background: '#3B82F6',
                        color: '#fff',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}>
                        ✏️ Éditer
                      </button>
                    )}
                  </div>

                  {/* Résumé */}
                  <div style={{ marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                      Résumé
                    </h4>
                    <p style={{ fontSize: '14px', color: '#374151' }}>{cr.resume}</p>
                  </div>

                  {/* Participants */}
                  {cr.participants && (
                    <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6B7280' }}>
                      <strong>Participants:</strong> {cr.participants}
                    </div>
                  )}

                  {/* Décisions */}
                  {cr.decisions && (
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                        Décisions
                      </h4>
                      <p style={{ fontSize: '14px', color: '#374151' }}>{cr.decisions}</p>
                    </div>
                  )}

                  {/* Photos */}
                  {cr.photos && cr.photos.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#6B7280', marginBottom: '8px' }}>
                        Photos ({cr.photos.length})
                      </h4>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '8px',
                      }}>
                        {cr.photos.map((photoUrl, idx) => (
                          <img
                            key={idx}
                            src={photoUrl}
                            alt={`Photo ${idx + 1}`}
                            style={{
                              width: '100%',
                              height: '150px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #E5E7EB',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commentaires */}
                  <div style={{
                    borderTop: '1px solid #E5E7EB',
                    paddingTop: '12px',
                    marginTop: '12px',
                  }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#6B7280', marginBottom: '8px' }}>
                      💬 Commentaires
                    </h4>
                    {/* Placeholder pour commentaires */}
                    <p style={{ fontSize: '12px', color: '#9CA3AF' }}>Commentaires à implémenter</p>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
