'use client'
import { SUIVI, PRIORITY_LADDER, daysLate, effectivePriority, newRow } from '../../lib/crSuivi'

const SUIVI_STYLE = {
  fait: { color: '#047857', bg: '#ECFDF5', border: '#6EE7B7' },
  en_cours: { color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
  relance: { color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
  nouveau: { color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD' },
}
const PRIO_COLOR = { Urgent: '#B91C1C', 'En cours': '#1D4ED8', 'En attente': '#64748B' }

const small = {
  padding: '6px 8px', minHeight: 34, border: '1.5px solid #E2E8F0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
}

/**
 * Actions du CR : reprises du CR précédent (Fait / En cours / À relancer)
 * et nouvelles actions. Une action « À relancer » prend un rappel et monte
 * d'un cran de priorité à l'enregistrement.
 */
export default function CRActionsEditor({ rows, onChange, crId, crDate, nextDate, entreprises = [], m }) {
  const update = (key, p) => onChange(rows.map(r => (r.key === key ? { ...r, ...p } : r)))
  const remove = (key) => onChange(rows.filter(r => r.key !== key))
  const add = () => onChange([...rows, newRow({ crDate, nextDate })])
  const listId = 'cr-entreprises'
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.suivi]: (acc[r.suivi] || 0) + 1 }), {})

  return (
    <div>
      <datalist id={listId}>{entreprises.map(e => <option key={e} value={e} />)}</datalist>
      {rows.length > 0 && (
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
          {Object.entries(SUIVI).filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label.toLowerCase()}`).join(' · ')}
        </div>
      )}
      {rows.length === 0 && (
        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#64748B', marginBottom: 8 }}>
          Aucune action en cours sur ce chantier. Ajoute les actions décidées pendant la réunion.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => {
          const st = SUIVI_STYLE[r.suivi] || SUIVI_STYLE.en_cours
          const late = r.isNew ? 0 : daysLate(r.echeance, crDate)
          const nextPrio = effectivePriority(r, crId)
          const willRemind = !r.isNew && r.suivi === 'relance' && !!r.orig && r.orig.dernier_rappel_cr_id !== crId
          const willEscalate = willRemind && nextPrio !== r.priorite
          const nbRappels = r.rappels + (willRemind ? 1 : 0)
          return (
            <div key={r.key} data-testid="cr-action" style={{
              border: `1.5px solid ${st.border}`, background: st.bg, borderRadius: 8, padding: 10,
              opacity: r.missing ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {r.isNew ? (
                  <span style={{ fontSize: 10, fontWeight: 800, color: st.color, background: '#fff', border: `1px solid ${st.border}`, borderRadius: 5, padding: '3px 7px' }}>NOUVELLE</span>
                ) : (
                  <div role="radiogroup" aria-label={`État de « ${r.titre} »`} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {['fait', 'en_cours', 'relance'].map(k => {
                      const on = r.suivi === k
                      const s = SUIVI_STYLE[k]
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on} disabled={r.missing}
                          onClick={() => update(r.key, { suivi: k })}
                          style={{
                            padding: '5px 9px', minHeight: 30, borderRadius: 6, fontSize: 11, fontWeight: 700,
                            fontFamily: 'inherit', cursor: r.missing ? 'default' : 'pointer',
                            border: `1.5px solid ${on ? s.color : '#E2E8F0'}`,
                            background: on ? '#fff' : 'rgba(255,255,255,0.6)', color: on ? s.color : '#94A3B8',
                          }}>{k === 'fait' ? '✓ ' : k === 'relance' ? '🔔 ' : ''}{SUIVI[k]}</button>
                      )
                    })}
                  </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.origineNumero ? <span style={{ fontSize: 10, color: '#64748B' }}>CR n°{r.origineNumero}</span> : null}
                  {late > 0 && r.suivi !== 'fait' && <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C' }}>retard {late} j</span>}
                  {nbRappels > 0 && r.suivi !== 'fait' && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C' }}>rappel n°{nbRappels}</span>
                  )}
                  {r.missing && <span style={{ fontSize: 10, color: '#64748B' }}>tâche supprimée</span>}
                  {r.isNew && (
                    <button type="button" onClick={() => remove(r.key)} aria-label="Retirer cette action"
                      style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : '2.4fr 1.4fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                <input aria-label="Action" value={r.titre} disabled={r.missing}
                  onChange={e => update(r.key, { titre: e.target.value })}
                  placeholder="Action à mener…"
                  style={{ ...small, gridColumn: m ? '1 / -1' : 'auto', fontWeight: 600 }} />
                <input aria-label="Entreprise" value={r.entreprise} list={listId} disabled={r.missing}
                  onChange={e => update(r.key, { entreprise: e.target.value })}
                  placeholder="Entreprise" style={{ ...small, gridColumn: m ? '1 / -1' : 'auto' }} />
                <input aria-label="Échéance" type="date" value={r.echeance || ''} disabled={r.missing}
                  onChange={e => update(r.key, { echeance: e.target.value })} style={small} />
                <select aria-label="Priorité" value={PRIORITY_LADDER.includes(r.priorite) ? r.priorite : 'En cours'} disabled={r.missing}
                  onChange={e => update(r.key, { priorite: e.target.value })}
                  style={{ ...small, color: PRIO_COLOR[r.priorite] || '#0F172A', fontWeight: 600 }}>
                  {PRIORITY_LADDER.map(p => <option key={p} value={p}>{p === 'En attente' ? 'Basse' : p === 'En cours' ? 'Normale' : 'Urgente'}</option>)}
                </select>
              </div>
              {willEscalate && (
                <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6 }}>
                  Relance : priorité relevée à « {nextPrio === 'Urgent' ? 'Urgente' : 'Normale'} » à l&apos;enregistrement.
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" onClick={add} style={{
        marginTop: 8, background: '#fff', border: '1.5px dashed #7C3AED', color: '#7C3AED', borderRadius: 8,
        padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
      }}>+ Nouvelle action</button>
    </div>
  )
}
