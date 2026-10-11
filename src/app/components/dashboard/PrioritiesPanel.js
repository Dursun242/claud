'use client'
import { useEffect, useState } from 'react'
import { useMotDuJourState } from '../../hooks/useMotDuJour'
import { Skeleton, SkeletonRows } from '../Skeleton'
import Emoji from '../Emoji'
import { EMOJI } from '../../lib/emoji'


/**
 * Bloc « Mes priorités du jour » (admin) : les 3 éléments les plus urgents,
 * chantier et commercial mélangés (lib/priorities.js), avec la raison, puis
 * « Le mot du jour » de l'assistant IA (une fois par jour et par liste).
 *
 * @param priorities  résultat de buildPriorities
 * @param onOpen      (tab, focusId) => void
 * @param userId      id de l'utilisateur (cache du mot du jour)
 * @param today       AAAA-MM-JJ
 * @param ready       toutes les données sont chargées (le mot du jour n'est
 *                    demandé qu'une fois la liste définitive)
 */
export default function PrioritiesPanel({ priorities, onOpen, userId, today, ready = true, m }) {
  const { top, total } = priorities
  const { text: mot, loading: motLoading } = useMotDuJourState({ items: top, total, userId, today, enabled: ready })
  const more = total - top.length
  // Tant que toutes les données ne sont pas là (commercial, conformité…),
  // la liste peut encore changer d'ordre : lignes d'attente plutôt qu'une
  // liste qui se réordonne sous les yeux. Au plus 2,5 s, puis on affiche.
  const [waitedEnough, setWaitedEnough] = useState(false)
  useEffect(() => {
    if (ready) return undefined
    const t = setTimeout(() => setWaitedEnough(true), 2500)
    return () => clearTimeout(t)
  }, [ready])
  const settled = ready || waitedEnough

  return (
    <section aria-labelledby="priorities-title" style={{
      background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
      border: '1px solid var(--separator)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: top.length ? 12 : 4 }}>
        <Emoji e={EMOJI.priorites} size={32} />
        <h2 id="priorities-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--label)', letterSpacing: '-0.01em' }}>Mes priorités du jour</h2>
        {more > 0 && (
          <span style={{ fontSize: 12, color: 'var(--label-secondary)' }}>
            + {more} autre{more > 1 ? 's' : ''} point{more > 1 ? 's' : ''} plus bas
          </span>
        )}
      </div>

      {!settled ? (
        <SkeletonRows count={3} />
      ) : top.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--label-secondary)', padding: '2px 0' }}>
          Rien d&apos;urgent : bonne journée
        </div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {top.map((it, i) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it.tab, it.focus)} className="u-press u-press--row" style={{
                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
                padding: m ? '10px 12px' : '9px 12px', background: 'var(--row-fill)', border: 'none',
                borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
                <span aria-hidden="true" style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  background: i === 0 ? 'var(--accent)' : 'var(--separator)', color: i === 0 ? '#fff' : 'var(--label-2)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: m ? 14 : 13, fontWeight: 700, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#48484A', marginTop: 1 }}>{it.reason}</span>
                </span>
                <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--separator-opaque)' }}>›</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {(mot || (settled && motLoading)) && (
        <p aria-live="polite" style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid var(--grouped-bg)', fontSize: 13, color: 'var(--label-2)', lineHeight: 1.45, minHeight: 56, boxSizing: 'border-box' }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--label-secondary)', marginBottom: 3 }}>
            Le mot du jour
          </span>
          {mot || <Skeleton width="80%" height={12} style={{ marginTop: 4 }} />}
        </p>
      )}
    </section>
  )
}
