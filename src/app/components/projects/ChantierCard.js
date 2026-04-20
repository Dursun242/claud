'use client'
import { memo } from 'react'
import Image from 'next/image'
import { phase as phaseColors, status as statusColors, fmtDate, PBar, Icon, I } from '../../dashboards/shared'
import Badge from '../Badge'

// Carte d'un chantier dans la liste. Memoïsée : tant que ses props ne
// changent pas (ch, counts, m, readOnly), taper dans la barre de recherche
// ou changer de filtre ne la re-render pas.
//
// Les compteurs sont passés pré-calculés par le parent : évite que chaque
// carte refasse `(data.ordresService || []).filter(...)` à chaque render,
// ce qui était O(N²) sur la liste.
function ChantierCardImpl({ ch, counts, m, readOnly, onOpen, onEdit, onDelete }) {
  const now = Date.now()
  const start = new Date(ch.date_debut || ch.dateDebut)
  const end = new Date(ch.date_fin || ch.dateFin)
  const total = end.getTime() - start.getTime()
  const elapsed = Math.max(0, Math.min(total, now - start.getTime()))
  const progress = total > 0 ? Math.round((elapsed / total) * 100) : 0
  const isDone = ch.statut === 'Terminé'
  const progressColor = isDone ? '#10B981' : phaseColors[ch.phase] || '#3B82F6'

  return (
    <div
      onClick={() => onOpen(ch)}
      style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        borderLeft: `4px solid ${phaseColors[ch.phase] || '#94A3B8'}`,
        cursor: 'pointer', transition: 'all .2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
        e.currentTarget.style.transform = 'translateX(4px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
        e.currentTarget.style.transform = ''
      }}
    >
      {ch.photo_couverture && (
        <div style={{ height: 80, overflow: 'hidden', position: 'relative' }}>
          <Image
            src={ch.photo_couverture}
            alt={ch.nom}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{
        padding: m ? 14 : 18,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: m ? 14 : 16, fontWeight: 700 }}>{ch.nom}</span>
            <Badge text={ch.phase} color={phaseColors[ch.phase] || '#64748B'}/>
            <Badge text={ch.statut} color={statusColors[ch.statut] || '#64748B'}/>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{ch.client} — {ch.adresse}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
            <span>{counts.os} OS</span>
            <span>{counts.cr} CR</span>
            <span>{counts.tasks} tâches</span>
            <span>{counts.attachments} PJ</span>
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(ch)} style={{
              background: '#F8FAFC', border: '1px solid #E2E8F0',
              borderRadius: 6, padding: 5, cursor: 'pointer',
            }}>
              <Icon d={I.edit} size={14} color="#64748B"/>
            </button>
            <button onClick={() => onDelete(ch)} style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 6, padding: 5, cursor: 'pointer',
            }}>
              <Icon d={I.trash} size={14} color="#EF4444"/>
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: `0 ${m ? 14 : 18}px ${m ? 14 : 18}px`, marginTop: -4 }}>
        <PBar value={isDone ? 100 : Math.min(progress, 100)} max={100} color={progressColor}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
          <span>{fmtDate(start)} → {fmtDate(end)}</span>
          <span style={{ color: progressColor, fontWeight: 600 }}>
            {isDone ? 'Terminé' : progress + '%'}
          </span>
        </div>
      </div>
    </div>
  )
}

const ChantierCard = memo(ChantierCardImpl)
export default ChantierCard
