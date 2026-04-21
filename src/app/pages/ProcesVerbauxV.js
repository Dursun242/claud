'use client'
import { useState, useMemo } from 'react'
import { useToast } from '../contexts/ToastContext'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusColor(statut) {
  switch (statut) {
    case 'Signé': return { bg: '#ECFDF5', color: '#059669', icon: '✓' }
    case 'Envoyé': return { bg: '#EFF6FF', color: '#0284C7', icon: '⏳' }
    case 'Brouillon': return { bg: '#F3F4F6', color: '#6B7280', icon: '📝' }
    case 'Refusé': return { bg: '#FEF2F2', color: '#DC2626', icon: '✕' }
    default: return { bg: '#F1F5F9', color: '#64748B', icon: '?' }
  }
}

function decisionColor(decision) {
  switch (decision) {
    case 'Accepté': return { bg: '#ECFDF5', color: '#059669', icon: '✓' }
    case 'Accepté avec réserve': return { bg: '#FEF3C7', color: '#D97706', icon: '⚠️' }
    case 'Refusé': return { bg: '#FEF2F2', color: '#DC2626', icon: '✕' }
    case 'En attente': return { bg: '#F1F5F9', color: '#64748B', icon: '⏳' }
    default: return { bg: '#F1F5F9', color: '#64748B', icon: '?' }
  }
}

export default function ProcesVerbauxV({ data, m, reload, user: _user }) {
  const { addToast } = useToast()
  const [selectedPV, setSelectedPV] = useState(null)
  const [q, setQ] = useState('')

  // Tous les PV de tous les chantiers
  const allPVs = useMemo(() => {
    return (data.proces_verbaux || [])
      .filter(pv => {
        if (!q.trim()) return true
        const search = q.toLowerCase()
        return pv.numero.toLowerCase().includes(search) ||
               pv.titre.toLowerCase().includes(search)
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [data.proces_verbaux, q])

  // Chantiers pour le contexte
  const chantiersMap = useMemo(() => {
    return new Map(data.chantiers.map(c => [c.id, c]))
  }, [data.chantiers])

  const handleDecision = async (pvId, decision, motif) => {
    try {
      const res = await fetch('/api/pv-reception/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pvId,
          decision,
          motifRefus: decision === 'Refusé' ? motif : null
        })
      })

      if (!res.ok) throw new Error('Erreur enregistrement')
      addToast(`PV ${decision}`, 'success')
      reload?.()
      setSelectedPV(null)
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  return (
    <div>
      {/* En-tête */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>Procès-verbaux de réception</h1>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
          {allPVs.length} PV{allPVs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Recherche */}
      <input
        type="text"
        placeholder="🔍 Chercher par numéro ou titre..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'inherit',
          marginBottom: 16,
          outline: 'none'
        }}
      />

      {/* Liste */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
        {allPVs.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
            Aucun procès-verbal
          </div>
        ) : (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {allPVs.map((pv, idx) => {
              const chantier = chantiersMap.get(pv.chantier_id)
              const sigStatus = statusColor(pv.statut_signature)
              const decStatus = decisionColor(pv.statut_reception)

              return (
                <button
                  key={pv.id}
                  onClick={() => setSelectedPV(pv)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderTop: idx > 0 ? '1px solid #F1F5F9' : 'none',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                      {pv.numero}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {pv.titre}
                    </div>
                    {chantier && (
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                        {chantier.nom}
                      </div>
                    )}
                  </div>

                  {/* Signature */}
                  <div style={{
                    padding: '4px 8px',
                    background: sigStatus.bg,
                    color: sigStatus.color,
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap'
                  }}>
                    {sigStatus.icon} {pv.statut_signature}
                  </div>

                  {/* Décision */}
                  <div style={{
                    padding: '4px 8px',
                    background: decStatus.bg,
                    color: decStatus.color,
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap'
                  }}>
                    {decStatus.icon} {pv.statut_reception}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Détail modal */}
      {selectedPV && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setSelectedPV(null)}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  {selectedPV.numero}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748B' }}>
                  {selectedPV.titre}
                </p>
                {chantiersMap.get(selectedPV.chantier_id) && (
                  <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#94A3B8' }}>
                    {chantiersMap.get(selectedPV.chantier_id).nom}
                  </p>
                )}
              </div>
              <button onClick={() => setSelectedPV(null)} style={{
                background: 'none',
                border: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: '#94A3B8'
              }}>×</button>
            </div>

            {/* Infos */}
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ color: '#94A3B8', fontSize: 10, fontWeight: 600 }}>DATE RÉCEPTION</div>
                  <div style={{ color: '#0F172A', fontWeight: 600, marginTop: 2 }}>
                    {formatDate(selectedPV.date_reception)}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#94A3B8', fontSize: 10, fontWeight: 600 }}>STATUT SIGNATURE</div>
                  <div style={{ color: '#0F172A', fontWeight: 600, marginTop: 2 }}>
                    {selectedPV.statut_signature}
                  </div>
                </div>
              </div>
            </div>

            {/* Signataires */}
            {(selectedPV.signataire_moe_email || selectedPV.signataire_moa_email || selectedPV.signataire_entreprise_email) && (
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 8 }}>SIGNATAIRES</div>
                {selectedPV.signataire_moe_email && (
                  <div style={{ color: '#0F172A', marginBottom: 4 }}>
                    <strong>MOE:</strong> {selectedPV.signataire_moe_email}
                  </div>
                )}
                {selectedPV.signataire_moa_email && (
                  <div style={{ color: '#0F172A', marginBottom: 4 }}>
                    <strong>MOA:</strong> {selectedPV.signataire_moa_email}
                  </div>
                )}
                {selectedPV.signataire_entreprise_email && (
                  <div style={{ color: '#0F172A' }}>
                    <strong>Entreprise:</strong> {selectedPV.signataire_entreprise_email}
                  </div>
                )}
              </div>
            )}

            {/* Décision */}
            {selectedPV.statut_signature === 'Signé' && selectedPV.statut_reception === 'En attente' && (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>
                  DÉCISION FINALE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Accepté', 'Accepté avec réserve', 'Refusé'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleDecision(selectedPV.id, opt, opt === 'Refusé' ? 'Voir motif' : null)}
                      style={{
                        padding: '8px 12px',
                        background: '#0F172A',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedPV.statut_reception !== 'En attente' && (
              <div style={{
                background: decisionColor(selectedPV.statut_reception).bg,
                borderRadius: 8,
                padding: 12,
                color: decisionColor(selectedPV.statut_reception).color,
                fontSize: 12,
                fontWeight: 600
              }}>
                Décision: {selectedPV.statut_reception}
                {selectedPV.motif_refus && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 400 }}>Motif: {selectedPV.motif_refus}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
