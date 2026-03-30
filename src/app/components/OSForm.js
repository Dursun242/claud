'use client'
import { useState } from 'react'
import { useToast } from '@/app/contexts/ToastContext'

/**
 * Formulaire complet pour créer/éditer un Ordre de Service
 */
export default function OSForm({ os, chantier, onSave, onCancel, contacts = [] }) {
  const { addToast } = useToast()
  const [formData, setFormData] = useState(os || {
    numero: 'OS-' + Date.now(),
    client_nom: '',
    client_adresse: '',
    artisan_nom: '',
    artisan_specialite: '',
    artisan_tel: '',
    artisan_email: '',
    artisan_siret: '',
    date_emission: new Date().toISOString().split('T')[0],
    date_intervention: '',
    date_fin_prevue: '',
    prestations: [],
    montant_ht: 0,
    montant_tva: 0,
    montant_ttc: 0,
    observations: '',
    conditions: 'Paiement à 30 jours à compter de la réception de la facture.',
  })

  const [newPrestation, setNewPrestation] = useState({
    description: '',
    unite: '',
    quantite: 1,
    prix_unitaire: 0,
    tva_taux: 20,
  })

  const [saving, setSaving] = useState(false)

  const handleAddPrestation = () => {
    if (!newPrestation.description) {
      addToast('Veuillez entrer une description', 'warning')
      return
    }

    const ht = parseFloat(newPrestation.quantite) * parseFloat(newPrestation.prix_unitaire)
    const tva = ht * (parseFloat(newPrestation.tva_taux) / 100)
    const ttc = ht + tva

    setFormData({
      ...formData,
      prestations: [...(formData.prestations || []), newPrestation],
      montant_ht: (parseFloat(formData.montant_ht) || 0) + ht,
      montant_tva: (parseFloat(formData.montant_tva) || 0) + tva,
      montant_ttc: (parseFloat(formData.montant_ttc) || 0) + ttc,
    })

    setNewPrestation({
      description: '',
      unite: '',
      quantite: 1,
      prix_unitaire: 0,
      tva_taux: 20,
    })
  }

  const handleRemovePrestation = (idx) => {
    const p = formData.prestations[idx]
    const ht = parseFloat(p.quantite) * parseFloat(p.prix_unitaire)
    const tva = ht * (parseFloat(p.tva_taux) / 100)
    const ttc = ht + tva

    setFormData({
      ...formData,
      prestations: formData.prestations.filter((_, i) => i !== idx),
      montant_ht: Math.max(0, (parseFloat(formData.montant_ht) || 0) - ht),
      montant_tva: Math.max(0, (parseFloat(formData.montant_tva) || 0) - tva),
      montant_ttc: Math.max(0, (parseFloat(formData.montant_ttc) || 0) - ttc),
    })
  }

  const handleSubmit = async () => {
    if (!formData.numero || !formData.client_nom) {
      addToast('Veuillez remplir les champs obligatoires', 'warning')
      return
    }

    setSaving(true)
    try {
      await onSave(formData)
    } finally {
      setSaving(false)
    }
  }

  const btnStyle = { padding: '8px 12px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }
  const inputStyle = { padding: '8px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: '#374151' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {/* Colonne gauche */}
      <div>
        {/* Numéro */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Numéro OS *</label>
          <input
            type="text"
            value={formData.numero}
            onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Client */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Client *</label>
          <input
            type="text"
            value={formData.client_nom}
            onChange={(e) => setFormData({ ...formData, client_nom: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Adresse Client */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Adresse Client</label>
          <input
            type="text"
            value={formData.client_adresse}
            onChange={(e) => setFormData({ ...formData, client_adresse: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Dates */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Date Émission</label>
          <input
            type="date"
            value={formData.date_emission}
            onChange={(e) => setFormData({ ...formData, date_emission: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Date Intervention</label>
          <input
            type="date"
            value={formData.date_intervention}
            onChange={(e) => setFormData({ ...formData, date_intervention: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Date Fin Prévue</label>
          <input
            type="date"
            value={formData.date_fin_prevue}
            onChange={(e) => setFormData({ ...formData, date_fin_prevue: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>

      {/* Colonne droite */}
      <div>
        {/* Artisan */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Entreprise/Artisan *</label>
          <input
            type="text"
            value={formData.artisan_nom}
            onChange={(e) => setFormData({ ...formData, artisan_nom: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Spécialité</label>
          <input
            type="text"
            value={formData.artisan_specialite}
            onChange={(e) => setFormData({ ...formData, artisan_specialite: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Téléphone</label>
          <input
            type="tel"
            value={formData.artisan_tel}
            onChange={(e) => setFormData({ ...formData, artisan_tel: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={formData.artisan_email}
            onChange={(e) => setFormData({ ...formData, artisan_email: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>SIRET</label>
          <input
            type="text"
            value={formData.artisan_siret}
            onChange={(e) => setFormData({ ...formData, artisan_siret: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>

      {/* Prestations (pleine largeur) */}
      <div style={{ gridColumn: '1 / -1' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Prestations</h3>

        {/* Tableau prestations */}
        {formData.prestations && formData.prestations.length > 0 && (
          <div style={{
            marginBottom: '16px',
            overflowX: 'auto',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}>
              <thead>
                <tr style={{ background: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Description</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>Unité</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>Qté</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>PU HT</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>TVA</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>Total HT</th>
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {formData.prestations.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '8px' }}>{p.description}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{p.unite}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{p.quantite}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{Number(p.prix_unitaire).toFixed(2)} €</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{p.tva_taux}%</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>
                      {(parseFloat(p.quantite) * parseFloat(p.prix_unitaire)).toFixed(2)} €
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleRemovePrestation(idx)}
                        style={{
                          ...btnStyle,
                          background: '#EF4444',
                          color: '#fff',
                          fontSize: '11px',
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Form ajout prestation */}
        <div style={{
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
            <div>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={newPrestation.description}
                onChange={(e) => setNewPrestation({ ...newPrestation, description: e.target.value })}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Unité</label>
              <input
                type="text"
                value={newPrestation.unite}
                onChange={(e) => setNewPrestation({ ...newPrestation, unite: e.target.value })}
                placeholder="m², h, ..."
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Qté</label>
              <input
                type="number"
                value={newPrestation.quantite}
                onChange={(e) => setNewPrestation({ ...newPrestation, quantite: e.target.value })}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>PU HT</label>
              <input
                type="number"
                value={newPrestation.prix_unitaire}
                onChange={(e) => setNewPrestation({ ...newPrestation, prix_unitaire: e.target.value })}
                step="0.01"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div>
              <label style={labelStyle}>TVA %</label>
              <select
                value={newPrestation.tva_taux}
                onChange={(e) => setNewPrestation({ ...newPrestation, tva_taux: e.target.value })}
                style={{ ...inputStyle, width: '100%' }}
              >
                <option value="0">0%</option>
                <option value="5.5">5.5%</option>
                <option value="20">20%</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleAddPrestation}
                style={{
                  ...btnStyle,
                  background: '#10B981',
                  color: '#fff',
                  width: '100%',
                }}
              >
                ➕ Ajouter
              </button>
            </div>
          </div>
        </div>

        {/* Totaux */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 150px',
          gap: '16px',
          marginBottom: '16px',
        }}>
          <div />
          <div style={{ borderTop: '2px solid #3B82F6', paddingTop: '8px' }}>
            <div style={{ marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              <span>Total HT:</span>
              <span style={{ float: 'right' }}>{Number(formData.montant_ht).toFixed(2)} €</span>
            </div>
            <div style={{ marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              <span>TVA:</span>
              <span style={{ float: 'right' }}>{Number(formData.montant_tva).toFixed(2)} €</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#3B82F6', borderTop: '1px solid #E5E7EB', paddingTop: '8px' }}>
              <span>Total TTC:</span>
              <span style={{ float: 'right' }}>{Number(formData.montant_ttc).toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observations et Conditions (pleine largeur) */}
      <div style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
        <label style={labelStyle}>Observations</label>
        <textarea
          value={formData.observations}
          onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
          style={{
            ...inputStyle,
            width: '100%',
            minHeight: '80px',
            fontFamily: 'sans-serif',
          }}
        />
      </div>

      <div style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
        <label style={labelStyle}>Conditions</label>
        <textarea
          value={formData.conditions}
          onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
          style={{
            ...inputStyle,
            width: '100%',
            minHeight: '80px',
            fontFamily: 'sans-serif',
          }}
        />
      </div>

      {/* Boutons */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            ...btnStyle,
            background: '#6B7280',
            color: '#fff',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
          disabled={saving}
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          style={{
            ...btnStyle,
            background: '#3B82F6',
            color: '#fff',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
          disabled={saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
