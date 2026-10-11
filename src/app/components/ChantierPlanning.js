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
    <Section title="Planning" count={items.length}>
      {items.map((p) => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff', borderRadius: 10, padding: '10px 14px',
          marginBottom: 6, border: '1px solid #E5E5EA',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E' }}>{p.tache}</div>
            <div style={{ fontSize: 12, color: '#6E6E73' }}>
              {p.lot} • {fmtDate(p.debut)} → {fmtDate(p.fin)}
            </div>
          </div>
          <div style={{ width: 80 }}>
            <PBar value={p.avancement} max={100} color="#0071E3" h={6}/>
            <div style={{
              fontSize: 12, fontWeight: 600, color: '#3A3A3C',
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
