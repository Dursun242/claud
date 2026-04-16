'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'
import { generatePVPdfBase64 } from '../lib/pv-pdf'

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

function PVRow({ pv, onDetail }) {
  const sigStatus = statusColor(pv.statut_signature)
  const decStatus = decisionColor(pv.statut_reception)

  return (
    <button
      onClick={() => onDetail(pv)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderBottom: '1px solid #F1F5F9',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {/* Numéro */}
      <div style={{ minWidth: 100, fontWeight: 600, fontSize: 12, color: '#0F172A' }}>
        {pv.numero}
      </div>

      {/* Titre */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pv.titre}
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
          {formatDate(pv.date_reception)}
        </div>
      </div>

      {/* Statut signature */}
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

      {/* Statut décision */}
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
}

function PVDetail({ pv, onClose, onDecision }) {
  const [decision, setDecision] = useState('')
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const handleSubmitDecision = async () => {
    if (!decision) {
      addToast('Veuillez sélectionner une décision', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/pv-reception/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pvId: pv.id,
          decision,
          motifRefus: decision === 'Refusé' ? motif : null
        })
      })

      if (!res.ok) throw new Error('Erreur enregistrement')
      addToast(`PV ${decision}`, 'success')
      onDecision()
      onClose()
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
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
              {pv.numero}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748B' }}>
              {pv.titre}
            </p>
          </div>
          <button onClick={onClose} style={{
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
                {formatDate(pv.date_reception)}
              </div>
            </div>
            <div>
              <div style={{ color: '#94A3B8', fontSize: 10, fontWeight: 600 }}>STATUT SIGNATURE</div>
              <div style={{ color: '#0F172A', fontWeight: 600, marginTop: 2 }}>
                {pv.statut_signature}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {pv.description && (
          <div style={{ marginBottom: 16, fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
            {pv.description}
          </div>
        )}

        {/* Signataires */}
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11 }}>
          <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 8 }}>SIGNATAIRES</div>
          {pv.signataire_moe_email && (
            <div style={{ color: '#0F172A', marginBottom: 4 }}>
              <strong>MOE:</strong> {pv.signataire_moe_email}
              {pv.date_signature_moe && <span style={{ color: '#94A3B8', marginLeft: 8 }}>✓ {formatDate(pv.date_signature_moe)}</span>}
            </div>
          )}
          {pv.signataire_moa_email && (
            <div style={{ color: '#0F172A', marginBottom: 4 }}>
              <strong>MOA:</strong> {pv.signataire_moa_email}
              {pv.date_signature_moa && <span style={{ color: '#94A3B8', marginLeft: 8 }}>✓ {formatDate(pv.date_signature_moa)}</span>}
            </div>
          )}
          {pv.signataire_entreprise_email && (
            <div style={{ color: '#0F172A' }}>
              <strong>Entreprise:</strong> {pv.signataire_entreprise_email}
              {pv.date_signature_entreprise && <span style={{ color: '#94A3B8', marginLeft: 8 }}>✓ {formatDate(pv.date_signature_entreprise)}</span>}
            </div>
          )}
        </div>

        {/* Décision - seulement si signé */}
        {pv.statut_signature === 'Signé' && pv.statut_reception === 'En attente' && (
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>
              DÉCISION FINALE
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {['Accepté', 'Accepté avec réserve', 'Refusé'].map((opt) => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                  <input
                    type="radio"
                    name="decision"
                    value={opt}
                    checked={decision === opt}
                    onChange={(e) => setDecision(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{opt}</span>
                </label>
              ))}
            </div>

            {decision === 'Refusé' && (
              <textarea
                placeholder="Motif du refus..."
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  minHeight: 80,
                  marginBottom: 12
                }}
              />
            )}

            <button
              onClick={handleSubmitDecision}
              disabled={saving}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#0F172A',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer la décision'}
            </button>
          </div>
        )}

        {pv.statut_reception !== 'En attente' && (
          <div style={{ background: decisionColor(pv.statut_reception).bg, borderRadius: 8, padding: 12, color: decisionColor(pv.statut_reception).color, fontSize: 12, fontWeight: 600 }}>
            Décision enregistrée: {pv.statut_reception}
            {pv.motif_refus && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 400 }}>Motif: {pv.motif_refus}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProcesVerbalReception({ chantierId, onRefresh }) {
  const [pvs, setPvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPv, setSelectedPv] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const { addToast } = useToast()

  const loadPVs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pv-reception/list?chantierId=${chantierId}`)
      const data = await res.json()
      setPvs(data.data || [])
    } catch (err) {
      console.error('Erreur chargement PV:', err)
      addToast('Erreur chargement PV', 'error')
    } finally {
      setLoading(false)
    }
  }, [chantierId, addToast])

  useEffect(() => {
    loadPVs()
  }, [loadPVs])

  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
      {/* En-tête */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Procès-verbaux de réception
          </h2>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {pvs.length} PV{pvs.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          style={{
            padding: '6px 12px',
            background: '#0F172A',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Nouveau PV
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
          Chargement...
        </div>
      ) : pvs.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
          Aucun PV de réception
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {pvs.map((pv) => (
            <PVRow key={pv.id} pv={pv} onDetail={setSelectedPv} />
          ))}
        </div>
      )}

      {/* Détails */}
      {selectedPv && (
        <PVDetail
          pv={selectedPv}
          onClose={() => setSelectedPv(null)}
          onDecision={() => {
            loadPVs()
            onRefresh?.()
          }}
        />
      )}

      {/* Form nouveau PV */}
      {showNewForm && (
        <PVNewForm
          chantierId={chantierId}
          onClose={() => setShowNewForm(false)}
          onSuccess={() => {
            setShowNewForm(false)
            loadPVs()
            onRefresh?.()
          }}
        />
      )}
    </div>
  )
}

function PVNewForm({ chantierId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    numero: '',
    titre: '',
    description: '',
    dateReception: '',
    signataireMoeEmail: '',
    signataireMotEmail: '',
    signataireEntrepriseEmail: '',
  })
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.numero || !form.titre) {
      addToast('Numéro et titre requis', 'error')
      return
    }

    setSaving(true)
    try {
      // Générer le PDF pour la signature
      const pdfBase64 = generatePVPdfBase64(form)

      const res = await fetch('/api/pv-reception/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chantierId,
          ...form,
          pdfBase64,
          operationName: `PV - ${form.titre}`
        })
      })

      if (!res.ok) throw new Error('Erreur création')
      const data = await res.json()
      addToast('PV créé et envoyé en signature', 'success')
      onSuccess()
    } catch (err) {
      addToast('Erreur: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        maxWidth: 600,
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
          Nouveau PV de réception
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            placeholder="Numéro (ex: PV-2024-001)"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
            required
          />
          <input
            type="text"
            placeholder="Titre"
            value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
            required
          />
          <textarea
            placeholder="Description (optionnelle)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', minHeight: 80, resize: 'vertical' }}
          />
          <input
            type="date"
            value={form.dateReception}
            onChange={(e) => setForm({ ...form, dateReception: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
          />

          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>SIGNATAIRES</div>
            <input
              type="email"
              placeholder="Email MOE (Maître d'œuvre)"
              value={form.signataireMoeEmail}
              onChange={(e) => setForm({ ...form, signataireMoeEmail: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', width: '100%', marginBottom: 8 }}
            />
            <input
              type="email"
              placeholder="Email MOA (Maître d'ouvrage)"
              value={form.signataireMotEmail}
              onChange={(e) => setForm({ ...form, signataireMotEmail: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', width: '100%', marginBottom: 8 }}
            />
            <input
              type="email"
              placeholder="Email Entreprise"
              value={form.signataireEntrepriseEmail}
              onChange={(e) => setForm({ ...form, signataireEntrepriseEmail: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#F1F5F9',
                color: '#0F172A',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#0F172A',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Création...' : 'Créer et signer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
