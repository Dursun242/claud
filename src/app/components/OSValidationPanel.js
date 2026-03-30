'use client'
import { useState } from 'react'
import { osService } from '@/app/services/osService'
import { useToast } from '@/app/contexts/ToastContext'

/**
 * Panel de validation d'un OS par le client
 * Checkbox + Date + Confirmation
 */
export default function OSValidationPanel({ os, clientId, onValidated }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [validationDate, setValidationDate] = useState(new Date().toISOString().split('T')[0])

  const handleValidate = async () => {
    if (!window.confirm('Valider cet Ordre de Service?')) return

    setLoading(true)
    try {
      await osService.validateByClient(os.id, clientId)
      addToast('Ordre de Service validé avec succès', 'success')
      setLoading(false)
      if (onValidated) onValidated()
    } catch (err) {
      console.error('Erreur validation:', err)
      setLoading(false)
      addToast('Erreur: ' + err.message, 'error')
    }
  }

  if (os.validation_client) {
    return (
      <div style={{
        background: '#10B981',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: '6px',
        fontSize: '14px',
      }}>
        ✅ Validé le {new Date(os.date_validation_client).toLocaleDateString('fr-FR')}
      </div>
    )
  }

  return (
    <div style={{
      background: '#F3F4F6',
      border: '1px solid #D1D5DB',
      padding: '16px',
      borderRadius: '8px',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
    }}>
      <div style={{ flex: 1 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={true}
            onChange={() => {}}
            disabled={loading}
          />
          <span>J'approuve cet Ordre de Service</span>
        </label>
        <input
          type="date"
          value={validationDate}
          onChange={(e) => setValidationDate(e.target.value)}
          disabled={loading}
          style={{
            marginTop: '8px',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #D1D5DB',
            fontSize: '14px',
          }}
        />
      </div>
      <button
        onClick={handleValidate}
        disabled={loading}
        style={{
          background: '#3B82F6',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'En cours...' : 'Valider'}
      </button>
    </div>
  )
}
