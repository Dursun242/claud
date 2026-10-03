'use client'
import { useMotDuJour } from '../../hooks/useMotDuJour'

// Couleur du repère par type de priorité
const COLOR = {
  task: '#F59E0B', rdv: '#2563EB', relance: '#EC4899', planning: '#10B981', os: '#8B5CF6',
  chaud: '#DC2626', signature: '#7C3AED', expire: '#D97706', sans_reponse: '#B45309',
  brouillon: '#64748B', dormante: '#64748B',
}

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
  const mot = useMotDuJour({ items: top, total, userId, today, enabled: ready })
  const more = total - top.length

  return (
    <section aria-labelledby="priorities-title" style={{
      background: '#fff', borderRadius: 14, padding: m ? 14 : 18,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18,
      border: top.length ? '1.5px solid #BFDBFE' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: top.length ? 12 : 4 }}>
        <h2 id="priorities-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>🎯 Mes priorités du jour</h2>
        {more > 0 && (
          <span style={{ fontSize: 11, color: '#64748B' }}>
            + {more} autre{more > 1 ? 's' : ''} point{more > 1 ? 's' : ''} plus bas
          </span>
        )}
      </div>

      {top.length === 0 ? (
        <div style={{ fontSize: 13, color: '#64748B', padding: '2px 0' }}>
          Rien d&apos;urgent : bonne journée
        </div>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {top.map((it, i) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it.tab, it.focus)} style={{
                width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
                padding: m ? '10px 12px' : '9px 12px', background: '#F8FAFC', border: 'none',
                borderLeft: `3px solid ${COLOR[it.kind] || '#3B82F6'}`, borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
                <span aria-hidden="true" style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  background: i === 0 ? '#1E3A5F' : '#E2E8F0', color: i === 0 ? '#fff' : '#334155',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: m ? 14 : 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#475569', marginTop: 1 }}>{it.reason}</span>
                </span>
                <span aria-hidden="true" style={{ fontSize: 14, color: '#CBD5E1' }}>›</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {mot && (
        <p aria-live="polite" style={{ margin: '12px 0 0', paddingTop: 10, borderTop: '1px solid #F1F5F9', fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
          <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 3 }}>
            Le mot du jour
          </span>
          {mot}
        </p>
      )}
    </section>
  )
}
