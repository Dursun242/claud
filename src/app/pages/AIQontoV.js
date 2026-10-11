'use client'
import { useState } from 'react'
import { useAIQonto } from '../useAIQonto'
import { useToast } from '../contexts/ToastContext'

export default function AIQontoV({ m }) {
  const { addToast } = useToast()
  const { analyzeQonto, analysis, loading, error } = useAIQonto()
  const [expanded, setExpanded] = useState(false)

  // Le token Qonto est stocké côté serveur dans Supabase et récupéré
  // directement par /api/ai-qonto. Plus besoin de le passer ici.
  const handleAnalyze = async () => {
    try {
      await analyzeQonto()
    } catch {
      addToast('Analyse Qonto échouée', 'error')
    }
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h1 style={{ color: '#E5E5EA', marginBottom: '20px' }}>🤖 IA Qonto</h1>

      {/* Bouton analyse */}
      <button
        onClick={handleAnalyze}
        disabled={loading}
        style={{
          padding: '12px 20px',
          background: loading ? '#6E6E73' : '#007AFF',
          color: '#FFF',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          marginBottom: '20px',
        }}
      >
        {loading ? '⏳ Analyse en cours...' : '🔍 Analyser Qonto'}
      </button>

      {error && (
        <div
          style={{
            background: '#FF3B30',
            color: '#FFF',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13px',
          }}
        >
          ❌ {error}
        </div>
      )}

      {analysis && (
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          {/* Résumé */}
          {analysis.analysis?.summary && (
            <div
              style={{
                background: '#2C2C2E',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #007AFF',
              }}
            >
              <h3 style={{ color: '#E5E5EA', margin: '0 0 10px 0', fontSize: '13px' }}>
                📊 Résumé Financier
              </h3>
              <p style={{ color: '#D1D1D6', margin: '0', fontSize: '13px', lineHeight: '1.5' }}>
                {analysis.analysis.summary}
              </p>
            </div>
          )}

          {/* Taux paiement */}
          {analysis.analysis?.paymentRate && (
            <div
              style={{
                background: '#2C2C2E',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #34C759',
              }}
            >
              <h3 style={{ color: '#E5E5EA', margin: '0 0 10px 0', fontSize: '13px' }}>
                💳 Taux de Paiement
              </h3>
              <p style={{ color: '#D1D1D6', margin: '0', fontSize: '13px', lineHeight: '1.5' }}>
                {analysis.analysis.paymentRate}
              </p>
            </div>
          )}

          {/* Clients */}
          {analysis.analysis?.topClients && (
            <div
              style={{
                background: '#2C2C2E',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #FF9500',
              }}
            >
              <h3 style={{ color: '#E5E5EA', margin: '0 0 10px 0', fontSize: '13px' }}>
                👥 Top Clients
              </h3>
              <ul style={{ color: '#D1D1D6', margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
                {Array.isArray(analysis.analysis.topClients)
                  ? analysis.analysis.topClients.map((client, i) => (
                      <li key={i}>{client}</li>
                    ))
                  : <li>{analysis.analysis.topClients}</li>}
              </ul>
            </div>
          )}

          {/* Recommandations */}
          {analysis.analysis?.recommendations && (
            <div
              style={{
                background: '#2C2C2E',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #FF2D55',
                gridColumn: m ? '1' : '1 / -1',
              }}
            >
              <h3
                style={{
                  color: '#E5E5EA',
                  margin: '0 0 10px 0',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(!expanded)}
              >
                💡 Recommandations {expanded ? '▼' : '▶'}
              </h3>
              {expanded && (
                <ul style={{ color: '#D1D1D6', margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
                  {Array.isArray(analysis.analysis.recommendations)
                    ? analysis.analysis.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))
                    : <li>{analysis.analysis.recommendations}</li>}
                </ul>
              )}
            </div>
          )}

          {/* Meta */}
          <div
            style={{
              background: '#1C1C1E',
              padding: '12px',
              borderRadius: '6px',
              gridColumn: m ? '1' : '1 / -1',
              textAlign: 'center',
              color: '#6E6E73',
              fontSize: '11px',
            }}
          >
            {analysis.invoiceCount} factures analysées • {new Date(analysis.generatedAt).toLocaleDateString('fr-FR')}
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div
          style={{
            background: '#2C2C2E',
            padding: '30px',
            borderRadius: '6px',
            textAlign: 'center',
            color: '#6E6E73',
          }}
        >
          <p>Clique sur "Analyser Qonto" pour voir les insights IA 🤖</p>
        </div>
      )}
    </div>
  )
}
