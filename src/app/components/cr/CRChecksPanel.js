'use client'
import { card } from './crStyles'

/**
 * « À vérifier avant diffusion » : ce qui manque au compte rendu (action
 * sans entreprise ou sans date, échéance dépassée, avancement non renseigné,
 * présences, point dont personne n'a parlé…), calculé par
 * lib/crSuivi.crChecks. Un clic mène à la partie à compléter ; un point non
 * évoqué se règle directement (Fait / En cours / À relancer).
 */
export default function CRChecksPanel({ checks = [], onGo, onRow }) {
  const questions = checks.filter(c => c.type === 'question')
  const infos = checks.filter(c => c.type !== 'question')
  const ok = !questions.length
  const line = (c) => (
    <li key={c.key}>
      <button type="button" onClick={() => onGo?.(c.anchor)}
        style={{ background: 'none', border: 'none', padding: '3px 0', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45, color: c.type === 'question' ? 'var(--label)' : 'var(--label-secondary)' }}>
        {c.text}
      </button>
      {/* Réponse rapide pour un point non évoqué */}
      {c.actions && onRow && (
        <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, flexWrap: 'wrap' }}>
          {c.actions.map(([suivi, txt]) => (
            <button key={suivi} type="button" aria-label={`${txt} : ${c.text}`} onClick={() => onRow(c.rowKey, { suivi })}
              style={{ border: '1px solid var(--separator-opaque)', background: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--label-2)' }}>
              {txt}
            </button>
          ))}
        </span>
      )}
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
