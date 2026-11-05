'use client'

/**
 * Pastille « score » d'une entreprise (lib/entrepriseScore.js). Rien si
 * l'entreprise n'a pas encore de note. Cliquable si `onClick` est fourni.
 */
export default function ScoreBadge({ score, onClick }) {
  if (!score || score.score == null) return null
  const g = score.grade
  const title = `Score ${score.score}/100 — ${g.label}${score.peuDeDonnees ? ' (peu de données)' : ''} : voir le détail`
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 4, background: g.bg, color: g.color,
    border: `1px solid ${g.border}`, borderRadius: 6, padding: '2px 8px 2px 4px', fontSize: 12, fontWeight: 500,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
  const content = (
    <>
      <span aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16,
        borderRadius: 4, background: g.color, color: '#fff', fontSize: 12, fontWeight: 600,
      }}>{g.grade}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>Score {score.score}{score.peuDeDonnees ? ' ?' : ''}</span>
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} title={title} aria-label={title} style={{ ...style, cursor: 'pointer' }}>{content}</button>
    : <span title={title} style={style}>{content}</span>
}
