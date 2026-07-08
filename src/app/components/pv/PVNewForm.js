'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../contexts/ToastContext'
import { generatePVPdf } from '../../generators'

// Modale de création d'un PV de réception : saisie titre + signataires,
// sélection de l'intervenant (→ pré-remplit les coordonnées entreprise),
// décision (accepté / réserve / refusé), aperçu PDF puis envoi en
// signature via Odoo Sign.
export default function PVNewForm({ chantierId, chantier, clientContact, ordresService = [], intervenants: intervenantsProp, onClose, onSuccess }) {
  const [form, setForm] = useState({
    titre: '',
    description: '',
    dateReception: '',
    signataireMoeEmail: '',
    signataireMotEmails: [''], // Jusqu'à 3 maîtres d'ouvrage (ex: co-propriétaires)
    selectedIntervenants: [], // Array of { nom, email, societe, adresse, codePostal, ville, tel, email, siret }
    decision: '',
    motifRefus: '',
    reservesAcceptation: ['']
  })
  const [intervenants, setIntervenants] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [previewPdf, setPreviewPdf] = useState(null)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    const moeEmail = 'contact@id-maitrise.com'
    const moaEmail = clientContact?.email || ''
    const today = new Date().toISOString().split('T')[0]

    setForm(f => ({
      ...f,
      signataireMoeEmail: moeEmail,
      signataireMotEmails: [moaEmail],
      dateReception: today
    }))

    // Intervenants du chantier : liste complète (OS + ajoutés manuellement
    // depuis la fiche chantier) transmise par le parent. Fallback sur les
    // seuls noms d'artisan déduits des OS si le prop n'est pas fourni
    // (rétrocompat anciens appelants).
    if (intervenantsProp && intervenantsProp.length > 0) {
      setIntervenants(intervenantsProp)
    } else {
      const artisanNames = [...new Set(ordresService.map(o => o.artisan_nom).filter(Boolean))]
      setIntervenants(artisanNames.map(name => ({ nom: name })))
    }
  }, [clientContact, ordresService, intervenantsProp])

  // Toggle sélection d'un intervenant : les coordonnées sont déjà connues
  // (contact chargé par le dashboard), pas besoin de requête supplémentaire.
  const handleIntervenantToggle = (intervenant) => {
    const isSelected = form.selectedIntervenants.some(i => i.nom === intervenant.nom)

    if (isSelected) {
      setForm(f => ({
        ...f,
        selectedIntervenants: f.selectedIntervenants.filter(i => i.nom !== intervenant.nom)
      }))
    } else {
      const entry = {
        nom: intervenant.nom,
        email: intervenant.email || intervenant.nom,
        societe: intervenant.societe || intervenant.nom || '',
        adresse: intervenant.adresse || '',
        codePostal: intervenant.code_postal || '',
        ville: intervenant.ville || '',
        tel: intervenant.tel || '',
        siret: intervenant.siret || ''
      }
      setForm(f => ({
        ...f,
        selectedIntervenants: [...f.selectedIntervenants, entry]
      }))
    }
  }

  // Générer aperçu PDF
  const generatePreview = async () => {
    try {
      const doc = await generatePVPdf({
        numero: `PV-${new Date().getFullYear()}-000`,
        titre: form.titre,
        description: form.description,
        dateReception: form.dateReception,
        chantierNom: chantier?.nom || '',
        chantierAdresse: chantier?.adresse || '',
        signataireMotEmails: form.signataireMotEmails.map(email => email?.trim()).filter(Boolean),
        selectedIntervenants: form.selectedIntervenants,
        decision: form.decision,
        motifRefus: form.decision === 'Refusé' ? form.motifRefus : null,
        reservesAcceptation: form.decision === 'Accepté avec réserve' ? form.reservesAcceptation.filter(r => r?.trim()).map((r, i) => `Ligne ${i + 1}: ${r}`).join('\n') : null
      })
      const blob = doc.output('blob')
      const pdfUrl = URL.createObjectURL(blob)
      setPreviewPdf(pdfUrl)
      setShowPreview(true)
    } catch (err) {
      addToast('Erreur génération aperçu: ' + err.message, 'error')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const moaEmails = form.signataireMotEmails.map(email => email?.trim()).filter(Boolean)
    if (!form.titre?.trim() || !form.signataireMoeEmail || moaEmails.length === 0) {
      addToast('Titre, MOE et au moins un MOA requis', 'error')
      return
    }
    if (form.selectedIntervenants.length === 0) {
      addToast('Sélectionnez au moins un intervenant', 'error')
      return
    }
    if (!form.decision) {
      addToast('Sélectionnez une décision', 'error')
      return
    }
    if (form.decision === 'Refusé' && !form.motifRefus?.trim()) {
      addToast('Motif de refus requis', 'error')
      return
    }
    if (form.decision === 'Accepté avec réserve' && !form.reservesAcceptation?.trim()) {
      addToast('Précisez les réserves', 'error')
      return
    }

    setSaving(true)
    try {
      // Récupérer le token d'authentification
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        addToast('Session expirée, reconnectez-vous', 'error')
        return
      }

      // Générer le PDF pour la signature
      let pdfBase64
      try {
        const doc = await generatePVPdf({
          numero: `PV-${new Date().getFullYear()}-000`,
          titre: form.titre,
          description: form.description,
          dateReception: form.dateReception,
          chantierNom: chantier?.nom || '',
          chantierAdresse: chantier?.adresse || '',
          signataireMotEmails: moaEmails,
          selectedIntervenants: form.selectedIntervenants,
          decision: form.decision,
          motifRefus: form.decision === 'Refusé' ? form.motifRefus : null,
          reservesAcceptation: form.decision === 'Accepté avec réserve' ? (Array.isArray(form.reservesAcceptation) ? form.reservesAcceptation.filter(r => r?.trim()).map((r, i) => `Ligne ${i + 1}: ${r}`).join('\n') : form.reservesAcceptation) : null
        })
        const blob = doc.output('blob')
        const buffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binaryString = ''
        for (let i = 0; i < bytes.length; i++) {
          binaryString += String.fromCharCode(bytes[i])
        }
        pdfBase64 = btoa(binaryString)
      } catch (pdfErr) {
        addToast('Erreur génération PDF: ' + pdfErr.message, 'error')
        setSaving(false)
        return
      }

      // Collecter les emails des intervenants
      const signataireEntrepriseEmails = form.selectedIntervenants.map(i => i.email).filter(Boolean)

      const res = await fetch('/api/pv-reception/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          chantierId,
          titre: form.titre,
          description: form.description,
          dateReception: form.dateReception,
          signataireMoeEmail: form.signataireMoeEmail,
          signataireMotEmails: moaEmails,
          signataireEntrepriseEmails,
          selectedIntervenants: form.selectedIntervenants,
          decision: form.decision,
          motifRefus: form.decision === 'Refusé' ? form.motifRefus : null,
          reservesAcceptation: form.decision === 'Accepté avec réserve' ? form.reservesAcceptation.filter(r => r?.trim()).map((r, i) => `Ligne ${i + 1}: ${r}`).join('\n') : null,
          pdfBase64,
          operationName: `PV - ${form.titre}`
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur création')

      // Confirmation visible de l'envoi en signature
      const recipients = [
        form.signataireMoeEmail,
        ...moaEmails,
        ...signataireEntrepriseEmails
      ].filter(Boolean)
      const recipientCount = recipients.length
      const msg = data.signUrl
        ? `✅ PV ${data.numero} envoyé en signature à ${recipientCount} signataire${recipientCount > 1 ? 's' : ''}`
        : `✅ PV ${data.numero} créé`
      addToast(msg, 'success', {
        duration: 7000,
        ...(data.signUrl ? {
          action: {
            label: 'Voir la demande',
            onClick: () => window.open(data.signUrl, '_blank', 'noopener'),
          },
        } : {}),
      })
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
            placeholder="Titre du PV"
            value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
            required
          />
          <textarea
            placeholder="Description (optionnelle)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', minHeight: 60, resize: 'vertical' }}
          />
          <input
            type="date"
            value={form.dateReception}
            onChange={(e) => setForm({ ...form, dateReception: e.target.value })}
            style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
          />

          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>SIGNATAIRES</div>

            <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 8, fontWeight: 600 }}>
              Sélectionner les intervenants/entreprises
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {intervenants.map(int => {
                const isSelected = form.selectedIntervenants.some(s => s.nom === int.nom)
                return (
                  <label
                    key={int.id || int.nom}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      border: isSelected ? '2px solid #3B82F6' : '1px solid #E2E8F0',
                      borderRadius: 6,
                      background: isSelected ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleIntervenantToggle(int)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: 500, color: '#0F172A' }}>{int.nom}</span>
                    {int.type && <span style={{ fontSize: 10, color: '#94A3B8' }}>({int.type})</span>}
                  </label>
                )
              })}
            </div>

            {form.selectedIntervenants.length > 0 && (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 8, fontSize: 11 }}>
                  Intervenants sélectionnés ({form.selectedIntervenants.length})
                </div>
                {form.selectedIntervenants.map((intervenant, idx) => (
                  <div key={intervenant.nom} style={{ marginBottom: idx < form.selectedIntervenants.length - 1 ? 12 : 0, fontSize: 10 }}>
                    <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{intervenant.nom}</div>
                    {intervenant.societe && <div style={{ color: '#64748B' }}>{intervenant.societe}</div>}
                    {intervenant.adresse && <div style={{ color: '#64748B' }}>{intervenant.adresse}</div>}
                    {(intervenant.codePostal || intervenant.ville) && <div style={{ color: '#64748B' }}>{intervenant.codePostal} {intervenant.ville}</div>}
                    {intervenant.tel && <div style={{ color: '#64748B' }}>Tel: {intervenant.tel}</div>}
                    {intervenant.email && <div style={{ color: '#64748B' }}>Email: {intervenant.email}</div>}
                    {intervenant.siret && <div style={{ color: '#64748B' }}>SIRET: {intervenant.siret}</div>}
                  </div>
                ))}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4, fontWeight: 600 }}>
              Email MOE (Maître d&apos;œuvre) {form.signataireMoeEmail ? '✓' : ''}
            </label>
            <input
              type="email"
              value={form.signataireMoeEmail}
              onChange={(e) => setForm({ ...form, signataireMoeEmail: e.target.value })}
              style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', width: '100%', marginBottom: 12 }}
              placeholder="ID MAÎTRISE"
              disabled
            />

            <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4, fontWeight: 600 }}>
              Email(s) MOA (Maître{form.signataireMotEmails.length > 1 ? 's' : ''} d&apos;ouvrage) — jusqu&apos;à 3 {form.signataireMotEmails.some(e => e?.trim()) ? '✓' : ''}
            </label>
            {form.signataireMotEmails.map((email, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    const emails = [...form.signataireMotEmails]
                    emails[idx] = e.target.value
                    setForm({ ...form, signataireMotEmails: emails })
                  }}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                  placeholder={idx === 0 ? 'Email du client du chantier' : `Co-propriétaire ${idx + 1}`}
                  required={idx === 0}
                />
                {form.signataireMotEmails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, signataireMotEmails: form.signataireMotEmails.filter((_, i) => i !== idx) })}
                    style={{
                      padding: '6px 10px', background: '#FEE2E2', color: '#DC2626',
                      border: '1px solid #FCA5A5', borderRadius: 6, fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', flexShrink: 0
                    }}
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            {form.signataireMotEmails.length < 3 && (
              <button
                type="button"
                onClick={() => setForm({ ...form, signataireMotEmails: [...form.signataireMotEmails, ''] })}
                style={{
                  padding: '8px 12px', background: '#DBEAFE', color: '#0284C7',
                  border: '1px solid #7DD3FC', borderRadius: 6, fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12
                }}
              >
                + Ajouter un maître d&apos;ouvrage
              </button>
            )}
          </div>

          {/* DÉCISION IMMÉDIATE */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>
              DÉCISION FINALE
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: 'Accepté', label: '✓ Accepté sans réserve', color: '#059669' },
                { value: 'Accepté avec réserve', label: '⚠️ Accepté avec réserve', color: '#D97706' },
                { value: 'Refusé', label: '✕ Refusé', color: '#DC2626' }
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  border: form.decision === opt.value ? `2px solid ${opt.color}` : '1px solid #E2E8F0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: form.decision === opt.value ? 'rgba(0,0,0,0.02)' : '#fff',
                  fontSize: 12
                }}>
                  <input
                    type="radio"
                    name="decision"
                    value={opt.value}
                    checked={form.decision === opt.value}
                    onChange={(e) => setForm({ ...form, decision: e.target.value, motifRefus: '', reservesAcceptation: '' })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: opt.color, fontWeight: 600 }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>

            {/* Motif refus */}
            {form.decision === 'Refusé' && (
              <textarea
                placeholder="Motif du refus..."
                value={form.motifRefus}
                onChange={(e) => setForm({ ...form, motifRefus: e.target.value })}
                style={{
                  width: '100%',
                  padding: 8,
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  minHeight: 80,
                  marginTop: 12
                }}
              />
            )}

            {/* Réserves acceptation */}
            {form.decision === 'Accepté avec réserve' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
                  Réserves mentionnées
                </div>
                {(Array.isArray(form.reservesAcceptation) ? form.reservesAcceptation : [form.reservesAcceptation || '']).map((reserve, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 50, fontSize: 11, fontWeight: 600, color: '#64748B', paddingTop: 9 }}>
                      Ligne {idx + 1}:
                    </div>
                    <textarea
                      value={reserve}
                      onChange={(e) => {
                        const reserves = Array.isArray(form.reservesAcceptation) ? [...form.reservesAcceptation] : [form.reservesAcceptation || '']
                        reserves[idx] = e.target.value
                        setForm({ ...form, reservesAcceptation: reserves })
                      }}
                      placeholder={`Précisez la réserve ${idx + 1}...`}
                      style={{
                        flex: 1,
                        padding: 8,
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        minHeight: 60
                      }}
                    />
                    {(Array.isArray(form.reservesAcceptation) ? form.reservesAcceptation : [form.reservesAcceptation || '']).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const reserves = Array.isArray(form.reservesAcceptation) ? form.reservesAcceptation : [form.reservesAcceptation || '']
                          const newReserves = reserves.filter((_, i) => i !== idx)
                          setForm({ ...form, reservesAcceptation: newReserves })
                        }}
                        style={{
                          padding: '6px 10px',
                          background: '#FEE2E2',
                          color: '#DC2626',
                          border: '1px solid #FCA5A5',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginTop: 8
                        }}
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const reserves = Array.isArray(form.reservesAcceptation) ? form.reservesAcceptation : [form.reservesAcceptation || '']
                    setForm({ ...form, reservesAcceptation: [...reserves, ''] })
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#DBEAFE',
                    color: '#0284C7',
                    border: '1px solid #7DD3FC',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    marginTop: 8
                  }}
                >
                  + Ajouter une réserve
                </button>
              </div>
            )}
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
              type="button"
              onClick={generatePreview}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#3B82F6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              👁️ Voir aperçu
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#1E3A5F',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? 'Création...' : '✓ Envoyer en signature'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal prévisualisation PDF */}
      {showPreview && previewPdf && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }} onClick={() => setShowPreview(false)}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            width: '90%',
            maxWidth: '800px',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 16, borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Aperçu du PV</h3>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94A3B8' }}>×</button>
            </div>
            <iframe
              title="Aperçu PV"
              src={previewPdf}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: '0 0 12px 12px'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
