'use client'
import { memo } from 'react'
import { OS_STATUSES, osStatusColor } from './osConstants'
import FilterPill, { pillRow } from '../FilterPill'

// Rangée de pastilles "Tous / Brouillon / Émis / …" pour filtrer la liste
// des OS par statut. Memoïsée : ne re-render que si le statut actif ou
// les compteurs changent.
function OsStatusPillsImpl({ statusFilter, onChange, countByStatus, m }) {
  const pills = [
    { key: 'all', label: 'Tous' },
    ...OS_STATUSES.map(s => ({ key: s, label: s, color: osStatusColor[s] })),
  ]
  return (
    <div role="group" aria-label="Filtrer par statut" style={pillRow(m)}>
      {pills.map(p => (
        <FilterPill key={p.key} active={statusFilter === p.key} color={p.color}
          label={p.label} count={countByStatus[p.key] || 0} onClick={() => onChange(p.key)} />
      ))}
    </div>
  )
}

const OsStatusPills = memo(OsStatusPillsImpl)
export default OsStatusPills
