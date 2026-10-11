'use client'
import { useState } from 'react'
import { useAIQonto } from '../useAIQonto'
import { useToast } from '../contexts/ToastContext'
import { btnP } from '../dashboards/shared'
import Emoji from '../components/Emoji'

const card = {
  background: '#fff', border: '1px solid #E5E5EA', borderRadius: 12, padding: 16,
}
const title = {
  display: 'flex', alignItems: 'center', gap: 8,
  margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: '#1C1C1E',
}
const text = { margin: 0, fontSize: 14, lineHeight: 1.5, color: '#3A3A3C' }
const list = { margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.5, color: '#3A3A3C' }

const asList = (v) => (Array.isArray(v) ? v : [v])

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

  const a = analysis?.analysis
  return (
    <div style={{ animation: 'fadeIn .3s ease' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: 'var(--label)' }}>
        <Emoji e="🤖" tile="#fff" />Analyse IA
      </h2>

      <button onClick={handleAnalyze} disabled={loading}
        style={{ ...btnP, marginBottom: 16, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}>
        {loading ? 'Analyse en cours…' : 'Analyser Qonto'}
      </button>

      {error && (
        <div role="alert" style={{
          background: 'var(--red-tint)', border: '1px solid var(--red-line)', color: 'var(--red-text)',
          padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 14,
        }}>{error}</div>
      )}

      {analysis && (
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          {a?.summary && (
            <div style={card}>
              <h3 style={title}><Emoji e="📊" size={24} />Résumé financier</h3>
              <p style={text}>{a.summary}</p>
            </div>
          )}
          {a?.paymentRate && (
            <div style={card}>
              <h3 style={title}><Emoji e="💳" size={24} />Taux de paiement</h3>
              <p style={text}>{a.paymentRate}</p>
            </div>
          )}
          {a?.topClients && (
            <div style={card}>
              <h3 style={title}><Emoji e="👥" size={24} />Principaux clients</h3>
              <ul style={list}>{asList(a.topClients).map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {a?.recommendations && (
            <div style={{ ...card, gridColumn: m ? '1' : '1 / -1' }}>
              <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
                style={{ ...title, margin: expanded ? '0 0 10px' : 0, background: 'none', border: 'none', padding: 0, minHeight: 32, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' }}>
                <Emoji e="💡" size={24} />Recommandations
                <span aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--label-secondary)', fontWeight: 400 }}>{expanded ? '⌃' : '⌄'}</span>
              </button>
              {expanded && <ul style={list}>{asList(a.recommendations).map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </div>
          )}
          <div style={{ gridColumn: m ? '1' : '1 / -1', textAlign: 'center', color: 'var(--label-secondary)', fontSize: 12 }}>
            {analysis.invoiceCount} factures analysées · {new Date(analysis.generatedAt).toLocaleDateString('fr-FR')}
          </div>
        </div>
      )}

      {!analysis && !loading && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--label-secondary)', fontSize: 14, padding: 24 }}>
          « Analyser Qonto » fait lire vos factures par l&apos;IA : résumé, taux de paiement, principaux clients et recommandations.
        </div>
      )}
    </div>
  )
}
