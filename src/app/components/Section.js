'use client'

/**
 * Composant Section
 * Wrapper réutilisable pour organiser les sections de contenu
 * Affiche un titre, un compteur optionnel, et le contenu
 */
export default function Section({
  title,
  count,
  color = '#3B82F6',
  children,
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
          {title}
        </h3>
        {count !== undefined && (
          <span
            style={{
              background: color + '18',
              color: color,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 10,
              padding: '2px 8px',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
