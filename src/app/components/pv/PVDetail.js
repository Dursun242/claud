'use client'
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../contexts/ToastContext'
import { formatDate, decisionColor } from './pvStatusHelpers'

// Modale de détail d'un PV : infos, signataires, téléchargement du PDF
// signé et décision finale (Accepté / avec réserve / Refusé).
export default function PVDetail({ pv, onClose, onDecision }) {
  const [decision, setDecision] = useState('')
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)
  const [downloadingSigned, setDownloadingSigned] = useState(false)
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

  // Télécharge le PDF signé final depuis Odoo.
  // On passe par fetch() + blob pour pouvoir envoyer le JWT Supabase en
  // header (un simple <a href> ne passerait pas l'Authorization).
  const handleDownloadSigned = async () => {
    if (!pv.odoo_sign_id) return
    setDownloadingSigned(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/odoo/signed-pdf?requestId=${pv.odoo_sign_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pv.numero}-signe.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Libérer l'URL objet après un délai court (le navigateur a le temps
      // d'initier le téléchargement).
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      addToast('PDF signé téléchargé', 'success')
    } catch (err) {
      addToast('Erreur téléchargement: ' + err.message, 'error')
    } finally {
      setDownloadingSigned(false)
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
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
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

        {/* Actions document : lien Odoo + téléchargement PDF signé */}
        {(pv.odoo_sign_url || pv.statut_signature === 'Signé') && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {pv.odoo_sign_url && (
              <a
                href={pv.odoo_sign_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '8px 12px',
                  background: '#EEF2FF',
                  color: '#4338CA',
                  border: '1px solid #C7D2FE',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                📎 Voir sur Odoo
              </a>
            )}
            {pv.statut_signature === 'Signé' && (
              <button
                onClick={handleDownloadSigned}
                disabled={downloadingSigned}
                style={{
                  padding: '8px 12px',
                  background: '#ECFDF5',
                  color: '#059669',
                  border: '1px solid #A7F3D0',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: downloadingSigned ? 'wait' : 'pointer',
                  opacity: downloadingSigned ? 0.6 : 1,
                }}
              >
                {downloadingSigned ? '⏳ Téléchargement…' : '📥 PDF signé'}
              </button>
            )}
          </div>
        )}

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
