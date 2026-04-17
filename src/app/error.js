'use client'

// ═══════════════════════════════════════════════════════════════
// error.js — ErrorBoundary au niveau de la route (Next.js App Router)
// ═══════════════════════════════════════════════════════════════
//
// Capture toute erreur non-gérée DANS le contenu de la route (pages,
// composants enfants) SANS démonter le root layout. Complément du
// <ErrorBoundary> interne dans page.js et du global-error.js.
//
// Hiérarchie des boundaries :
//   global-error.js   → crash du root layout lui-même (ultra rare)
//   error.js (ici)    → crash dans l'arbre de la route
//   ErrorBoundary.js  → boundary posé manuellement autour d'un composant

import { useEffect } from 'react';

export default function Error({ error, reset }) {
  useEffect(() => {
    // Visible dans la console navigateur + les logs Vercel/Next
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '32px 28px',
          maxWidth: 440,
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid #E2E8F0',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }} aria-hidden="true">
          ⚠️
        </div>
        <h2 style={{ margin: '0 0 8px', color: '#0F172A', fontSize: 18, fontWeight: 700 }}>
          Cette section a rencontré un problème
        </h2>
        <p style={{ margin: '0 0 20px', color: '#64748B', fontSize: 14, lineHeight: 1.6 }}>
          Tu peux réessayer sans perdre ta session — les autres parties
          de l&apos;application restent accessibles.
        </p>
        {error?.message && (
          <details style={{ textAlign: 'left', marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94A3B8' }}>
              Détails techniques
            </summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                background: '#F1F5F9',
                borderRadius: 8,
                fontSize: 11,
                overflowX: 'auto',
                color: '#475569',
                whiteSpace: 'pre-wrap',
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          </details>
        )}
        <button
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            background: '#1E3A5F',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
