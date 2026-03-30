'use client'
import { useState, useEffect } from 'react'
import { osService } from '@/app/services/osService'
import { generateOSPdf } from '@/app/generators'
import OSValidationPanel from '@/app/components/OSValidationPanel'

/**
 * Page Ordres de Service v3
 * Inclut:
 * - Liste des OS
 * - Édition/création OS
 * - Validation client avec checkbox + date
 * - Génération PDF (rendu identique à v2)
 */
export default function OrdresServiceV3({ data, chantier, currentUser = null, userRole = null }) {
  const [os_list, setOSList] = useState([])
  const [selectedOS, setSelectedOS] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (chantier?.id) {
      loadOS()
    }
  }, [chantier?.id])

  const loadOS = async () => {
    setLoading(true)
    try {
      const list = await osService.getByChantier(chantier.id)
      setOSList(list)
    } catch (err) {
      console.error('Erreur chargement OS:', err)
    }
    setLoading(false)
  }

  const handleEdit = (os) => {
    setFormData(os)
    setFormOpen(true)
  }

  const handleSave = async () => {
    try {
      await osService.upsert({
        ...formData,
        chantier_id: chantier.id,
      })
      setFormOpen(false)
      setFormData({})
      loadOS()
    } catch (err) {
      console.error('Erreur sauvegarde OS:', err)
      alert('Erreur: ' + err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet OS?')) return
    try {
      await osService.delete(id)
      loadOS()
    } catch (err) {
      console.error('Erreur suppression OS:', err)
      alert('Erreur: ' + err.message)
    }
  }

  const handlePDFDownload = (os) => {
    generateOSPdf({
      ...os,
      chantier: chantier.nom,
      adresse_chantier: chantier.adresse,
    })
  }

  const handleValidated = () => {
    loadOS()
    setSelectedOS(null)
  }

  // Couleurs thème
  const btnPrimary = { background: '#3B82F6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }
  const btnDanger = { ...btnPrimary, background: '#EF4444' }
  const btnSecondary = { ...btnPrimary, background: '#6B7280' }

  if (loading) return <div style={{ padding: '20px', color: '#9CA3AF' }}>Chargement...</div>

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📋 Ordres de Service</h2>
        {userRole === 'admin' || userRole === 'salarie' ? (
          <button
            onClick={() => {
              setFormData({ prestations: [] })
              setFormOpen(true)
            }}
            style={btnPrimary}
          >
            ➕ Nouveau OS
          </button>
        ) : null}
      </div>

      {/* Liste des OS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px',
      }}>
        {os_list.map(os => (
          <div
            key={os.id}
            style={{
              background: '#FFF',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '16px',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
            onClick={() => setSelectedOS(os)}
          >
            {/* En-tête */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              marginBottom: '12px',
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>{os.numero}</h3>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0 0' }}>
                  {new Date(os.date_emission).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <span style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                background: os.validation_client ? '#D1FAE5' : '#FEF3C7',
                color: os.validation_client ? '#047857' : '#92400E',
              }}>
                {os.validation_client ? '✅ Validé' : '⏳ En attente'}
              </span>
            </div>

            {/* Infos */}
            <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>
              <p><strong>Client:</strong> {os.client_nom}</p>
              <p><strong>Montant:</strong> {Number(os.montant_ttc).toLocaleString('fr-FR')} €</p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handlePDFDownload(os)
                }}
                style={{ ...btnDanger, flex: 1, fontSize: '12px' }}
              >
                📄 PDF
              </button>
              {(userRole === 'admin' || userRole === 'salarie') && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(os)
                    }}
                    style={{ ...btnSecondary, flex: 1, fontSize: '12px' }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(os.id)
                    }}
                    style={{ ...btnDanger, flex: 1, fontSize: '12px' }}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal détail OS */}
      {selectedOS && (
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
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>{selectedOS.numero}</h2>
              <button
                onClick={() => setSelectedOS(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Infos OS */}
            <div style={{ marginBottom: '20px', fontSize: '14px', color: '#374151' }}>
              <p><strong>Client:</strong> {selectedOS.client_nom}</p>
              <p><strong>Montant TTC:</strong> {Number(selectedOS.montant_ttc).toLocaleString('fr-FR')} €</p>
              <p><strong>Statut:</strong> {selectedOS.statut}</p>
            </div>

            {/* Panel validation client */}
            {userRole === 'client' && !selectedOS.validation_client && (
              <div style={{ marginBottom: '20px' }}>
                <OSValidationPanel
                  os={selectedOS}
                  clientId={currentUser?.id}
                  onValidated={handleValidated}
                />
              </div>
            )}

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedOS(null)}
                style={btnSecondary}
              >
                Fermer
              </button>
              <button
                onClick={() => handlePDFDownload(selectedOS)}
                style={btnDanger}
              >
                📄 Télécharger PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal édition OS (simplifié) */}
      {formOpen && (
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
            maxWidth: '600px',
            width: '90%',
          }}>
            <h2 style={{ marginBottom: '20px' }}>
              {formData.id ? 'Éditer OS' : 'Nouveau OS'}
            </h2>

            {/* Formulaire simplifié */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '600' }}>
                Numéro
              </label>
              <input
                type="text"
                value={formData.numero || ''}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Note: Formulaire complet à implémenter */}
            <p style={{ color: '#6B7280', fontSize: '12px', fontStyle: 'italic' }}>
              Formulaire complet en développement...
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => {
                  setFormOpen(false)
                  setFormData({})
                }}
                style={btnSecondary}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                style={btnPrimary}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
