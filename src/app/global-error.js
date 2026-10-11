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
      <body style={{ margin: 0, fontFamily: "var(--font-dm-sans), sans-serif" }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--label) 0%, var(--accent) 50%, var(--label) 100%)',
          padding: 24,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '40px 32px',
            maxWidth: 440,
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💥</div>
            <h2 style={{ margin: '0 0 8px', color: 'var(--label)', fontSize: 20, fontWeight: 700 }}>
              Erreur critique
            </h2>
            <p style={{ margin: '0 0 24px', color: 'var(--label-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              L&apos;application a rencontré un problème et n&apos;a pas pu se charger.<br />
              Recharge la page pour reprendre.
            </p>
            {error?.message && (
              <details style={{ textAlign: 'left', marginBottom: 20 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--label-tertiary)' }}>
                  Détails techniques
                </summary>
                <pre style={{
                  marginTop: 8, padding: 12, background: 'var(--grouped-bg)', borderRadius: 8,
                  fontSize: 11, overflowX: 'auto', color: '#48484A', whiteSpace: 'pre-wrap',
                }}>
                  {error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => (reset ? reset() : window.location.reload())}
              style={{
                padding: '10px 24px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
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
