'use client'
import { useMemo } from 'react'
import { EmptyState } from '../index'
import InteractionRow from './InteractionRow'

// Vue « Relances » : en retard / aujourd'hui / à venir
export default function FollowUpList({ followUps, opportunites, contactsById, onToggle, onOpen }) {
  const oppById = useMemo(() => new Map(opportunites.map(o => [o.id, o])), [opportunites])
  const groups = [
    { k: 'overdue', l: 'En retard', c: '#EF4444', list: followUps.overdue },
    { k: 'today',   l: "Aujourd'hui", c: '#F59E0B', list: followUps.today },
    { k: 'upcoming', l: 'À venir', c: '#3B82F6', list: followUps.upcoming },
  ]
  const total = groups.reduce((s, g) => s + g.list.length, 0)
  if (total === 0) {
    return <EmptyState icon="✅" title="Rien à relancer" description="Quand tu notes un échange, choisis « Demain », « Vendredi »… et la relance apparaîtra ici." />
  }
  return (
    <div>
      {groups.map(g => g.list.length > 0 && (
        <div key={g.k} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.c }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{g.l}</h3>
            <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{g.list.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
            {g.list.map(it => {
              const o = oppById.get(it.opportunite_id)
              const c = contactsById.get(it.contact_id || o?.contact_id)
              const ctx = [o?.titre, c?.nom].filter(Boolean).join(' · ')
              return (
                <div key={it.id} style={{ cursor: o ? 'pointer' : 'default' }}
                  // Un clic sur la case « faite » (ou son libellé) ne doit pas ouvrir la fiche
                  onClick={(e) => { if (o && !e.target.closest?.('label, input, button')) onOpen(o.id) }}>
                  <InteractionRow it={it} context={ctx} onToggle={() => onToggle(it)} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
