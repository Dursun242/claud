'use client'
import Emoji from './Emoji'

/**
 * Composant Section
 * Titre de section neutre (DESIGN.md, « Neutral Section Rule ») : titre en
 * nuit ardoise, compteur gris discret ; une section n'a pas de couleur
 * propre. `color` est encore accepté pour compatibilité mais ignoré.
 * `emoji` : repère facultatif devant le titre (lib/emoji.js).
 */
// eslint-disable-next-line no-unused-vars
export default function Section({ title, count, color, emoji, action, children }) {
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
        <Emoji e={emoji} tile="#fff" />
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--label)', letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {count !== undefined && (
          <span
            style={{
              background: 'var(--separator)',
              color: '#48484A',
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
