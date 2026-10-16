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
    display: 'inline-flex', alignItems: 'center', gap: 5, background: g.bg, color: g.color,
    border: `1px solid ${g.border}`, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
  const content = (
    <>
      <span aria-hidden="true" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15,
        borderRadius: 4, background: g.color, color: '#fff', fontSize: 10, fontWeight: 800,
      }}>{g.grade}</span>
      Score {score.score}{score.peuDeDonnees ? ' ?' : ''}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} title={title} aria-label={title} style={{ ...style, cursor: 'pointer' }}>{content}</button>
    : <span title={title} style={style}>{content}</span>
}
