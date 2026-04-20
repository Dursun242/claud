'use client'
import { memo } from 'react'
import { phase as phaseColors, status as statusColors } from '../../dashboards/shared'
import { PROJECT_STATUSES, PROJECT_PHASES, pillStyle, pillDot } from './projectsConstants'

// Deux rangées de pills (statut + phase) pour filtrer la liste des
// chantiers. Memoïsée : ne re-render que si un filtre actif change.
function ProjectsFilterPillsImpl({ filterStatut, filterPhase, onStatut, onPhase, m }) {
  return (
    <>
      {/* Statut */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap',
        overflowX: m ? 'auto' : 'visible', paddingBottom: m ? 4 : 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#94A3B8',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          alignSelf: 'center', marginRight: 4,
        }}>Statut</span>
        <button onClick={() => onStatut('')} style={pillStyle(filterStatut === '', '#1E3A5F')}>
          <span style={pillDot(filterStatut === '', '#64748B')}/>Tous
        </button>
        {PROJECT_STATUSES.map(s => {
          const active = filterStatut === s
          const color = statusColors[s] || '#1E3A5F'
          return (
            <button key={s} onClick={() => onStatut(active ? '' : s)} style={pillStyle(active, color)}>
              <span style={pillDot(active, color)}/>{s}
            </button>
          )
        })}
      </div>

      {/* Phase */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap',
        overflowX: m ? 'auto' : 'visible', paddingBottom: m ? 4 : 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#94A3B8',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          alignSelf: 'center', marginRight: 4,
        }}>Phase</span>
        <button onClick={() => onPhase('')} style={pillStyle(filterPhase === '', '#1E3A5F')}>
          <span style={pillDot(filterPhase === '', '#64748B')}/>Toutes
        </button>
        {PROJECT_PHASES.map(p => {
          const active = filterPhase === p
          const color = phaseColors[p] || '#1E3A5F'
          return (
            <button key={p} onClick={() => onPhase(active ? '' : p)} style={pillStyle(active, color)}>
              <span style={pillDot(active, color)}/>{p}
            </button>
          )
        })}
      </div>
    </>
  )
}

const ProjectsFilterPills = memo(ProjectsFilterPillsImpl)
export default ProjectsFilterPills
