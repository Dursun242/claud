'use client'

// ═══════════════════════════════════════════════════════════════
// global-error.js — Fallback ultime en cas de crash du root layout
// ═══════════════════════════════════════════════════════════════
//
// Next.js appelle ce composant quand une erreur se produit dans le
// root layout ou un de ses ancêtres — cas où même <ErrorBoundary>
// dans RootWrapper.js ne peut pas aider (il est monté APRÈS le layout).
//
// On affiche un écran minimaliste qui propose juste de recharger.
//
// Cas d'usage typiques :
// - ToastProvider ou ConfirmProvider qui plantent au mount
// - Imports manquants dans layout.js
// - Erreur dans le chargement des polices / métadonnées

export default function GlobalError({ error, reset }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F2F2F7',
          padding: 24,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '40px 32px',
            maxWidth: 440,
            textAlign: 'center',
            border: '1px solid #E5E5EA',
          }}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D70015" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" /></svg>
            <h2 style={{ margin: '0 0 8px', color: '#1C1C1E', fontSize: 20, fontWeight: 600 }}>
              Erreur critique
            </h2>
            <p style={{ margin: '0 0 24px', color: '#6E6E73', fontSize: 14, lineHeight: 1.6 }}>
              L&apos;application a rencontré un problème et n&apos;a pas pu se charger.<br />
              Recharge la page pour reprendre.
            </p>
            {error?.message && (
              <details style={{ textAlign: 'left', marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6E6E73' }}>
                  Détails techniques
                </summary>
                <pre style={{
                  marginTop: 8, padding: 12, background: '#F2F2F7', borderRadius: 8,
                  fontSize: 12, overflowX: 'auto', color: '#48484A', whiteSpace: 'pre-wrap',
                }}>
                  {error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => (reset ? reset() : window.location.reload())}
              style={{
                padding: '0 20px',
                minHeight: 44,
                background: '#0071E3',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
