'use client'

/**
 * Composants skeleton pour le chargement initial.
 *
 * Deux objectifs :
 * 1. Remplacer les spinners statiques « Chargement… » par une silhouette
 *    de la page finale → perception de vitesse x2 sans changer les perfs
 *    réelles (effet psychologique documenté).
 * 2. Fournir une structure visuelle stable qui évite le CLS (Cumulative
 *    Layout Shift) quand les vraies données arrivent.
 *
 * Exports :
 * - `Skeleton`          — boîte grise primitive avec shimmer
 * - `DashboardSkeleton` — silhouette complète du dashboard (sidebar + main)
 * - `PageSkeleton`      — silhouette générique pour les lazy-imports de page
 */

// Keyframes shimmer injectées une fois par skeleton monté. Simple,
// compatible Next.js SSR/CSR, pas de dépendance globale.
const SHIMMER_STYLE = `
@keyframes skeletonShimmer {
  0% { background-position: -200% 0 }
  100% { background-position: 200% 0 }
}
`

const shimmerBase = {
  background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeletonShimmer 1.5s infinite',
}

// ─── Boîte primitive ──────────────────────────────────────────
export function Skeleton({ width = '100%', height = 12, radius = 6, style = {} }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: radius,
        ...shimmerBase,
        ...style,
      }}
    />
  )
}

// ─── Dashboard complet (sidebar + main) ──────────────────────
// Sur mobile (< 768px), la sidebar est cachée via CSS media query
// (cohérent avec le vrai layout où elle est un overlay déclenché
// par le hamburger). On affiche un header mobile à la place.
export function DashboardSkeleton({ role = 'admin' }) {
  const isClient = role === 'client'
  const tabCount = isClient ? 5 : 10

  return (
    <div
      role="status"
      aria-label="Chargement du tableau de bord"
      style={{
        display: 'flex',
        height: '100vh',
        fontFamily: "'DM Sans', sans-serif",
        background: '#F1F5F9',
        overflow: 'hidden',
      }}
    >
      <style>{SHIMMER_STYLE}{`
        @media (max-width: 768px) {
          [data-skel-sidebar] { display: none !important; }
          [data-skel-mobile-header] { display: flex !important; }
          [data-skel-main] { padding: 16px !important; padding-top: 64px !important; }
          [data-skel-grid4] { grid-template-columns: repeat(2, 1fr) !important; }
          [data-skel-grid3] { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Mobile header (visible uniquement < 768px) ── */}
      <div
        data-skel-mobile-header
        style={{
          display: 'none', /* visible via media query */
          position: 'fixed', top: 0, left: 0, right: 0, height: 52,
          background: '#fff', borderBottom: '1px solid #E2E8F0',
          alignItems: 'center', padding: '0 16px', zIndex: 997, gap: 10,
        }}
      >
        <Skeleton width={24} height={24} radius={4} />
        <div style={{ flex: 1 }}>
          <Skeleton width={90} height={10} style={{ marginBottom: 4 }} />
          <Skeleton width={140} height={16} />
        </div>
      </div>

      {/* ── Sidebar (gradient foncé — cachée sur mobile via CSS) ── */}
      <aside
        data-skel-sidebar
        aria-hidden="true"
        style={{
          width: 240,
          background: 'linear-gradient(195deg, #0F172A, #1E3A5F)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          padding: '20px 16px 16px',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ width: 110, height: 14, background: 'rgba(255,255,255,0.15)', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ width: 150, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }} />
        </div>
        {/* Search bar */}
        <div style={{ height: 32, background: 'rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 14 }} />
        {/* Onglets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {Array.from({ length: tabCount }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 32,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 7,
              }}
            />
          ))}
        </div>
        {/* User footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 3, marginBottom: 4, width: '80%' }} />
              <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 3, width: '60%' }} />
            </div>
          </div>
          <div style={{ height: 26, background: 'rgba(255,255,255,0.08)', borderRadius: 6 }} />
        </div>
      </aside>

      {/* ── Main content ── */}
      <main data-skel-main style={{ flex: 1, padding: 24, overflow: 'hidden' }}>
        {/* Header / greeting */}
        <div style={{ marginBottom: 22 }}>
          <Skeleton width={240} height={28} />
          <div style={{ height: 8 }} />
          <Skeleton width={160} height={12} />
        </div>

        {/* Quick actions (4 tiles → 2 on mobile) */}
        <div
          data-skel-grid4
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 22,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1.5px solid #E2E8F0',
                borderRadius: 10,
                padding: '14px 12px',
                height: 96,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <Skeleton width={40} height={40} radius={10} />
              <Skeleton width={80} height={10} />
            </div>
          ))}
        </div>

        {/* KPIs (4 chiffres clés → 2 on mobile) */}
        <div
          data-skel-grid4
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: '12px 14px',
                height: 68,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Skeleton width="65%" height={10} />
              <Skeleton width="45%" height={22} />
            </div>
          ))}
        </div>

        {/* Grande card (chantiers en cours) */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            padding: 18,
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
            marginBottom: 18,
          }}
        >
          <Skeleton width={180} height={18} />
          <div style={{ height: 14 }} />
          <div data-skel-grid3 style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: '1.5px solid #E2E8F0',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <Skeleton width="75%" height={14} />
                <Skeleton width="55%" height={10} />
                <div style={{ height: 4 }} />
                <Skeleton width="100%" height={6} radius={3} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Skeleton width={60} height={9} />
                  <Skeleton width={80} height={9} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Skeleton pour un lazy-import de page (transition rapide) ──
// Utilisé à la place de « Chargement… » quand l'utilisateur change
// d'onglet et que le chunk n'est pas encore téléchargé.
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la page" style={{ padding: 16, animation: 'fadeIn .2s ease' }}>
      <style>{SHIMMER_STYLE}</style>

      {/* Titre + compteur */}
      <div style={{ marginBottom: 14 }}>
        <Skeleton width={200} height={24} />
        <div style={{ height: 6 }} />
        <Skeleton width={120} height={12} />
      </div>

      {/* Barre de recherche + boutons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Skeleton width={260} height={32} radius={7} />
        <Skeleton width={100} height={32} radius={7} />
        <Skeleton width={90} height={32} radius={7} />
      </div>

      {/* Pills de filtre */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width={70 + (i * 8)} height={26} radius={999} />
        ))}
      </div>

      {/* Liste de cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 14,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Skeleton width={40} height={40} radius={20} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="75%" height={10} />
            </div>
            <Skeleton width={80} height={28} radius={6} />
          </div>
        ))}
      </div>
    </div>
  )
}
