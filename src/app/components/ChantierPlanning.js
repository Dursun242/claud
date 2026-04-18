'use client'

// ═══════════════════════════════════════════════════════════════
// ChantierPlanning — liste en lecture seule des tâches de planning
// d'un chantier avec leur progression.
// ═══════════════════════════════════════════════════════════════

import Section from './Section'
import { PBar, fmtDate } from '../dashboards/shared'

export default function ChantierPlanning({ items = [] }) {
  if (items.length === 0) return null

  return (
    <Section title="Planning" count={items.length} color="#6366F1">
      {items.map((p) => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff', borderRadius: 8, padding: '10px 14px',
          marginBottom: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{p.tache}</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>
              {p.lot} • {fmtDate(p.debut)} → {fmtDate(p.fin)}
            </div>
          </div>
          <div style={{ width: 80 }}>
            <PBar value={p.avancement} max={100} color="#6366F1" h={6}/>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#6366F1',
              textAlign: 'right', marginTop: 2,
            }}>
              {p.avancement}%
            </div>
          </div>
        </div>
      ))}
    </Section>
  )
}
