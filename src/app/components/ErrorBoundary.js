'use client'
import { Component } from 'react'

/**
 * ErrorBoundary — Capture les erreurs React pour éviter un crash total de l'app.
 * Usage : <ErrorBoundary><MonComposant /></ErrorBoundary>
 *
 * Quand un enfant lève une erreur non gérée, ce composant affiche un écran de
 * secours propre plutôt qu'une page blanche.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // En production, on pourrait envoyer l'erreur à un service de monitoring
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#F8FAFC', fontFamily: "'DM Sans', sans-serif", padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 480,
            textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', color: '#0F172A', fontSize: 20, fontWeight: 700 }}>
              Une erreur est survenue
            </h2>
            <p style={{ margin: '0 0 24px', color: '#64748B', fontSize: 14, lineHeight: 1.6 }}>
              L&apos;application a rencontré un problème inattendu.
              <br />Rechargez la page pour reprendre.
            </p>
            {this.state.error && (
              <details style={{ textAlign: 'left', marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94A3B8' }}>
                  Détails techniques
                </summary>
                <pre style={{
                  marginTop: 8, padding: 12, background: '#F1F5F9', borderRadius: 8,
                  fontSize: 11, overflowX: 'auto', color: '#475569', whiteSpace: 'pre-wrap',
                }}>
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', background: '#1E3A5F', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Recharger l&apos;application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
