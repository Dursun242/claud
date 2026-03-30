'use client'
import { useState } from 'react'
import { useAIQonto } from '../useAIQonto'
import { useToast } from '../contexts/ToastContext'

export default function AIQontoV({ qontoToken, m }) {
  const { addToast } = useToast()
  const { analyzeQonto, analysis, loading, error } = useAIQonto()
  const [expanded, setExpanded] = useState(false)

  const handleAnalyze = async () => {
    if (!qontoToken) {
      addToast('Qonto token manquant', 'warning')
      return
    }
    await analyzeQonto(qontoToken)
  }

  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h1 style={{ color: '#E2E8F0', marginBottom: '20px' }}>🤖 IA Qonto</h1>

      {/* Bouton analyse */}
      <button
        onClick={handleAnalyze}
        disabled={loading}
        style={{
          padding: '12px 20px',
          background: loading ? '#64748B' : '#3B82F6',
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
            background: '#EF4444',
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
                background: '#1E293B',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #3B82F6',
              }}
            >
              <h3 style={{ color: '#E2E8F0', margin: '0 0 10px 0', fontSize: '13px' }}>
                📊 Résumé Financier
              </h3>
              <p style={{ color: '#CBD5E1', margin: '0', fontSize: '13px', lineHeight: '1.5' }}>
                {analysis.analysis.summary}
              </p>
            </div>
          )}

          {/* Taux paiement */}
          {analysis.analysis?.paymentRate && (
            <div
              style={{
                background: '#1E293B',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #10B981',
              }}
            >
              <h3 style={{ color: '#E2E8F0', margin: '0 0 10px 0', fontSize: '13px' }}>
                💳 Taux de Paiement
              </h3>
              <p style={{ color: '#CBD5E1', margin: '0', fontSize: '13px', lineHeight: '1.5' }}>
                {analysis.analysis.paymentRate}
              </p>
            </div>
          )}

          {/* Clients */}
          {analysis.analysis?.topClients && (
            <div
              style={{
                background: '#1E293B',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #F59E0B',
              }}
            >
              <h3 style={{ color: '#E2E8F0', margin: '0 0 10px 0', fontSize: '13px' }}>
                👥 Top Clients
              </h3>
              <ul style={{ color: '#CBD5E1', margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
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
                background: '#1E293B',
                padding: '15px',
                borderRadius: '6px',
                borderLeft: '4px solid #EC4899',
                gridColumn: m ? '1' : '1 / -1',
              }}
            >
              <h3
                style={{
                  color: '#E2E8F0',
                  margin: '0 0 10px 0',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(!expanded)}
              >
                💡 Recommandations {expanded ? '▼' : '▶'}
              </h3>
              {expanded && (
                <ul style={{ color: '#CBD5E1', margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
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
              background: '#0F172A',
              padding: '12px',
              borderRadius: '6px',
              gridColumn: m ? '1' : '1 / -1',
              textAlign: 'center',
              color: '#64748B',
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
            background: '#1E293B',
            padding: '30px',
            borderRadius: '6px',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          <p>Clique sur "Analyser Qonto" pour voir les insights IA 🤖</p>
        </div>
      )}
    </div>
  )
}
