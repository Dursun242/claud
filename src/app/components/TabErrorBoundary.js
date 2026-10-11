'use client'
import { Component } from 'react'

/**
 * TabErrorBoundary — isole un onglet : si la page plante, seul cet onglet
 * affiche un message (avec « Réessayer »), le reste de l'application
 * (menu, autres onglets, micro) continue de fonctionner.
 *
 * `resetKey` : quand il change (ex. nouvelles données), l'onglet retente
 * automatiquement son rendu.
 */
export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.retry = this.retry.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[onglet ${this.props.name || '?'}]`, error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.retry()
  }

  retry() {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{
        background: '#fff', border: '1px solid var(--red-line)', borderRadius: 12, padding: '24px 20px',
        maxWidth: 520, margin: '24px auto', textAlign: 'center', fontFamily: 'inherit',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden="true">⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label)', marginBottom: 6 }}>
          Cet onglet a rencontré un problème
        </div>
        <div style={{ fontSize: 13, color: '#48484A', marginBottom: 16 }}>
          Le reste de l&apos;application fonctionne. Réessaie, ou recharge la page si le problème persiste.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={this.retry} style={{
            padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Réessayer</button>
          <button onClick={() => window.location.reload()} style={{
            padding: '8px 18px', background: 'var(--grouped-bg)', color: 'var(--label-2)', border: '1px solid var(--separator)',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>Recharger la page</button>
        </div>
        <details style={{ marginTop: 14, textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--label-secondary)' }}>Détails techniques</summary>
          <pre style={{ marginTop: 6, padding: 10, background: 'var(--row-fill)', borderRadius: 8, fontSize: 11, color: '#48484A', whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </details>
      </div>
    )
  }
}
