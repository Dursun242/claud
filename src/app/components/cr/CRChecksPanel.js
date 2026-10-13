'use client'
import { card } from './crStyles'

/**
 * « À vérifier avant diffusion » : ce qui manque au compte rendu (action
 * sans entreprise ou sans date, échéance dépassée, avancement non renseigné,
 * présences…), calculé par lib/crSuivi.crChecks. Un clic mène à la partie à
 * compléter.
 */
export default function CRChecksPanel({ checks = [], onGo }) {
  const questions = checks.filter(c => c.type === 'question')
  const infos = checks.filter(c => c.type !== 'question')
  const ok = !questions.length
  const line = (c) => (
    <li key={c.key}>
      <button type="button" onClick={() => onGo?.(c.anchor)}
        style={{ background: 'none', border: 'none', padding: '3px 0', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45, color: c.type === 'question' ? 'var(--label)' : 'var(--label-secondary)' }}>
        {c.text}
      </button>
    </li>
  )
  return (
    <section aria-label="À vérifier avant diffusion" style={{
      ...card,
      background: ok ? 'var(--green-tint)' : 'var(--orange-tint)',
      borderColor: ok ? 'var(--green-line)' : 'var(--orange-line)',
    }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 15, color: ok ? 'var(--green-text)' : 'var(--orange-deep)' }}>
        {ok ? 'Rien ne manque pour diffuser' : `À vérifier avant diffusion (${questions.length})`}
      </h3>
      {questions.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{questions.map(line)}</ul>}
      {infos.length > 0 && <ul style={{ margin: questions.length ? '6px 0 0' : 0, paddingLeft: 18 }}>{infos.map(line)}</ul>}
    </section>
  )
}
