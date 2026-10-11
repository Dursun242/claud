'use client'
import { memo } from 'react'
import { phase as phaseColors, status as statusColors } from '../../dashboards/shared'
import { PROJECT_STATUSES, PROJECT_PHASES } from './projectsConstants'
import FilterPill, { pillRow } from '../FilterPill'

const rowLabel = {
  fontSize: 12, fontWeight: 600, color: '#6E6E73', flexShrink: 0, marginRight: 2,
}

// Deux rangées de pastilles (statut + phase) pour filtrer la liste des
// chantiers. Memoïsée : ne re-render que si un filtre actif change.
function ProjectsFilterPillsImpl({ filterStatut, filterPhase, onStatut, onPhase, m }) {
  return (
    <>
      <div role="group" aria-label="Statut" style={{ ...pillRow(m), marginBottom: m ? 0 : 8 }}>
        <span style={rowLabel}>Statut</span>
        <FilterPill active={filterStatut === ''} label="Tous" onClick={() => onStatut('')} />
        {PROJECT_STATUSES.map(s => {
          const active = filterStatut === s
          return (
            <FilterPill key={s} active={active} color={statusColors[s]} label={s}
              onClick={() => onStatut(active ? '' : s)} />
          )
        })}
      </div>
      <div role="group" aria-label="Phase" style={pillRow(m)}>
        <span style={rowLabel}>Phase</span>
        <FilterPill active={filterPhase === ''} label="Toutes" onClick={() => onPhase('')} />
        {PROJECT_PHASES.map(p => {
          const active = filterPhase === p
          return (
            <FilterPill key={p} active={active} color={phaseColors[p]} label={p}
              onClick={() => onPhase(active ? '' : p)} />
          )
        })}
      </div>
    </>
  )
}

const ProjectsFilterPills = memo(ProjectsFilterPillsImpl)
export default ProjectsFilterPills
