'use client'

/**
 * Composant Section
 * Titre de section neutre (DESIGN.md, « Neutral Section Rule ») : titre en
 * nuit ardoise, compteur gris discret ; une section n'a pas de couleur
 * propre. `color` est encore accepté pour compatibilité mais ignoré.
 */
// eslint-disable-next-line no-unused-vars
export default function Section({ title, count, color, action, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          minHeight: 32,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>
          {title}
        </h3>
        {count !== undefined && (
          <span
            style={{
              background: '#E2E8F0',
              color: '#475569',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              padding: '1px 8px',
              lineHeight: 1.5,
            }}
          >
            {count}
          </span>
        )}
        {action && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{action}</div>}
      </div>
      {children}
    </section>
  )
}
