'use client'
import { useState, useEffect } from 'react'
import AIQontoV from './AIQontoV'

export default function QontoV({ m, data, reload }) {
  const [qontoToken, setQontoToken] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)

  useEffect(() => {
    // Charger le token Qonto depuis localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('qonto_token')
      if (saved) {
        setQontoToken(saved)
      }
    }
  }, [])

  const handleSaveToken = () => {
    if (!qontoToken.trim()) {
      alert('Le token ne peut pas être vide')
      return
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('qonto_token', qontoToken)
      setShowTokenInput(false)
      alert('Token Qonto sauvegardé dans le navigateur')
    }
  }

  const handleClearToken = () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer le token Qonto ?')) {
      setQontoToken('')
      if (typeof window !== 'undefined') {
        localStorage.removeItem('qonto_token')
      }
      alert('Token supprimé')
    }
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h1 style={{ color: '#E2E8F0', marginBottom: '20px' }}>💰 Finances & Qonto</h1>

      {/* Section configuration token */}
      <div style={{ background: '#1E293B', padding: '15px', borderRadius: '6px', marginBottom: '20px', borderLeft: '4px solid #3B82F6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: m ? 'wrap' : 'nowrap' }}>
          <p style={{ color: '#CBD5E1', margin: 0 }}>
            {qontoToken ? '✅ Token Qonto configuré' : '⚠️ Token Qonto manquant'}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowTokenInput(!showTokenInput)}
              style={{
                padding: '8px 12px',
                background: '#3B82F6',
                color: '#FFF',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}
            >
              {showTokenInput ? '✕ Annuler' : '🔐 Configurer'}
            </button>
            {qontoToken && (
              <button
                onClick={handleClearToken}
                style={{
                  padding: '8px 12px',
                  background: '#EF4444',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                }}
              >
                🗑️ Supprimer
              </button>
            )}
          </div>
        </div>

        {showTokenInput && (
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #334155' }}>
            <label style={{ color: '#94A3B8', display: 'block', marginBottom: '8px', fontSize: '13px' }}>
              Token API Qonto (Bearer token):
            </label>
            <input
              type="password"
              value={qontoToken}
              onChange={(e) => setQontoToken(e.target.value)}
              placeholder="Collez votre token Bearer de Qonto"
              style={{
                width: '100%',
                padding: '10px',
                background: '#0F172A',
                color: '#E2E8F0',
                border: '1px solid #334155',
                borderRadius: '4px',
                fontSize: '14px',
                marginBottom: '10px',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleSaveToken}
              style={{
                padding: '8px 12px',
                background: '#10B981',
                color: '#FFF',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              💾 Sauvegarder Token
            </button>
          </div>
        )}
      </div>

      {/* AI Qonto Analysis */}
      {qontoToken && <AIQontoV qontoToken={qontoToken} m={m} />}

      {!qontoToken && (
        <div style={{ background: '#1E293B', padding: '30px', borderRadius: '6px', textAlign: 'center', color: '#64748B' }}>
          <p>Configurez votre token Qonto pour voir l'analyse IA de vos devis et factures</p>
        </div>
      )}
    </div>
  )
}
