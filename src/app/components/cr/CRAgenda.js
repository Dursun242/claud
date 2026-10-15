'use client'
import { card } from './crStyles'

const TONE = {
  danger: 'var(--red-text)',
  warning: 'var(--orange-deep)',
}

/**
 * Ordre du jour de la réunion, préparé automatiquement (lib/crSuivi.crAgenda) :
 * points en retard, lots en retard sur le planning, ordres de service,
 * documents des entreprises. Un clic mène à la partie du compte rendu.
 * `collapsible` (tablette, ordinateur) : une ligne « À aborder » à déplier,
 * rien quand il n'y a rien à aborder.
 */
export default function CRAgenda({ groups = [], onGo, collapsible = false }) {
  const list = groups.map(g => (
    <div key={g.key} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)', marginBottom: 2 }}>{g.title} ({g.items.length})</div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {g.items.map(it => (
          <li key={it.key}>
            <button type="button" onClick={() => onGo?.(it.anchor)}
              style={{ background: 'none', border: 'none', padding: '3px 0', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45, color: TONE[it.tone] || 'var(--label)' }}>
              {it.text}
            </button>
          </li>
        ))}
      </ol>
    </div>
  ))
  if (collapsible) {
    if (!groups.length) return null
    const n = groups.reduce((t, g) => t + g.items.length, 0)
    return (
      <section id="cr-section-agenda" aria-label="Ordre du jour" style={{ ...card, padding: '12px 16px', scrollMarginTop: 130 }}>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--label)' }}>
            À aborder pendant la réunion ({n})
            <span style={{ fontWeight: 400, color: 'var(--label-secondary)' }}> · {groups.map(g => g.title.toLowerCase()).join(', ')}</span>
          </summary>
          <div style={{ marginTop: 10 }}>{list}</div>
        </details>
      </section>
    )
  }
  return (
    <section id="cr-section-agenda" aria-label="Ordre du jour" style={{ ...card, scrollMarginTop: 120 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Ordre du jour</h3>
      <p style={{ fontSize: 12, color: 'var(--label-secondary)', margin: '0 0 10px' }}>
        Préparé automatiquement : ce qu&apos;il faut aborder en priorité pendant la réunion.
      </p>
      {groups.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--green-text)' }}>Rien de particulier : pas de retard, pas d&apos;ordre de service récent, documents à jour.</div>
      ) : list}
    </section>
  )
}
