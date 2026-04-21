'use client'
import { memo } from 'react'
import { OS_STATUSES, osStatusColor } from './osConstants'

// Rangée de pills "Tous / Brouillon / Émis / …" pour filtrer la liste
// des OS par statut. Memoïsée : ne re-render que si le statut actif ou
// les compteurs changent.
function OsStatusPillsImpl({ statusFilter, onChange, countByStatus, m }) {
  const pills = [
    { key: 'all', label: 'Tous', color: '#64748B' },
    ...OS_STATUSES.map(s => ({ key: s, label: s, color: osStatusColor[s] })),
  ]

  return (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14,
      overflowX: m ? 'auto' : 'visible', paddingBottom: m ? 4 : 0,
    }}>
      {pills.map(p => {
        const active = statusFilter === p.key
        const count = countByStatus[p.key] || 0
        return (
          <button key={p.key} onClick={() => onChange(p.key)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            border: `1px solid ${active ? p.color : '#E2E8F0'}`,
            background: active ? p.color : '#fff',
            color: active ? '#fff' : '#334155',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background .15s, color .15s, border-color .15s',
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: active ? '#fff' : p.color, opacity: active ? 0.8 : 1,
            }}/>
            {p.label}
            <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

const OsStatusPills = memo(OsStatusPillsImpl)
export default OsStatusPills
