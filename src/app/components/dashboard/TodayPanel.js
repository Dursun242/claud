'use client'
import { useState } from 'react'
import { fmtDate, Icon, I } from '../../dashboards/shared'

// Icône (dessinée, ardoise) par type d'entrée de l'agenda
const KIND = {
  rdv:      { icon: I.planning },
  task:     { icon: I.tasks },
  os:       { icon: I.os },
  planning: { icon: I.projects },
  relance:  { icon: I.crm },
}
const LATE = '#B91C1C'
const COLLAPSED = 6

/**
 * Bloc « Ma journée » : tout ce qui demande une action aujourd'hui, en une
 * liste unique triée par urgence (retards d'abord). Chaque ligne amène
 * directement à l'élément concerné.
 *
 * @param agenda  résultat de buildAgenda (lib/today.js)
 * @param onOpen  (tab, focusId) => void
 */
export default function TodayPanel({ agenda, onOpen, m }) {
  const [expanded, setExpanded] = useState(false)

  const relances = agenda.relances.map(r => ({ ...r, kind: 'relance' }))
  const sections = [
    { key: 'late',  title: 'En retard',            items: [...agenda.tasksOverdue, ...agenda.phases.filter(p => p.late), ...relances.filter(r => r.late)] },
    { key: 'today', title: "Aujourd'hui",          items: [...agenda.rdvToday, ...agenda.tasksToday, ...agenda.phases.filter(p => !p.late), ...relances.filter(r => !r.late)] },
    { key: 'sign',  title: 'En attente de signature', items: agenda.osToSign },
  ].filter(s => s.items.length)

  const total = sections.reduce((n, s) => n + s.items.length, 0)
  let budget = expanded ? Infinity : COLLAPSED

  return (
    <section aria-labelledby="today-title" style={{
      background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
      border: '1px solid #E2E8F0',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: total ? 12 : 4 }}>
        <h2 id="today-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Ma journée</h2>
        {total > 0 && (
          <span style={{ fontSize: 12, color: '#64748B' }}>
            {total} point{total > 1 ? 's' : ''} à traiter
          </span>
        )}
      </div>

      {total === 0 ? (
        <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: '#64748B' }}>
          Rien d&apos;urgent aujourd&apos;hui.
        </div>
      ) : sections.map(sec => {
        if (budget <= 0) return null
        const shown = sec.items.slice(0, budget)
        budget -= shown.length
        return (
          <div key={sec.key} style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: sec.key === 'late' ? LATE : '#64748B', marginBottom: 6,
            }}>{sec.title} · {sec.items.length}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
              {shown.map(it => {
                const k = KIND[it.kind] || KIND.task
                return (
                  <li key={`${it.kind}-${it.id}`}>
                    <button onClick={() => onOpen(it.tab, it.focus)} className="u-press u-press--row" style={{
                      width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
                      padding: m ? '10px 12px' : '8px 12px', background: '#F8FAFC', border: 'none',
                      borderRadius: 10,
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}>
                      <span aria-hidden style={{ display: 'inline-flex', color: it.late ? LATE : '#64748B', flexShrink: 0 }}><Icon d={k.icon} size={16}/></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                        {it.sub && <span style={{ display: 'block', fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</span>}
                      </span>
                      {it.late && it.date && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: LATE, whiteSpace: 'nowrap' }}>{fmtDate(it.date)}</span>
                      )}
                      <span aria-hidden style={{ fontSize: 14, color: '#CBD5E1' }}>›</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {total > COLLAPSED && (
        <button onClick={() => setExpanded(e => !e)} style={{
          fontSize: 13, color: '#1D4ED8', background: 'none', border: 'none', minHeight: 36,
          cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: '4px 0',
        }}>{expanded ? 'Réduire' : `Tout afficher (${total})`}</button>
      )}

      {agenda.rdvUpcoming.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }}>
            Rendez-vous à venir
          </div>
          {agenda.rdvUpcoming.slice(0, 3).map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#334155', padding: '3px 0', minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                {new Date(r.date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.title}{r.sub ? ` · ${r.sub}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
