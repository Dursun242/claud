'use client'
import { useState } from 'react'
import { btnS, fmtMoney } from '../../dashboards/shared'
import { EmptyState } from '../index'
import { ETAPES_ACTIVES, ETAPE_COLORS, nextEtape, daysSinceLastInteraction } from '../../lib/crm'
import OpportuniteCard from './OpportuniteCard'

// Pipeline des affaires actives : une étape à la fois sur mobile, Kanban
// avec glisser-déposer sur desktop. onMove(o, etape) change l'étape.
export default function CrmPipeline({
  m, grouped, stage, onSelectStage, contactsById, interactions,
  onOpen, onCall, onMove, onNew,
}) {
  const [dragged, setDragged] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const onDrop = async (etape) => {
    const o = dragged
    setDragged(null); setDragOver(null)
    if (o) await onMove(o, etape)
  }

  if (m) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
          {ETAPES_ACTIVES.map(e => {
            const active = stage === e
            const c = ETAPE_COLORS[e]
            return (
              <button key={e} onClick={() => onSelectStage(e)} style={{
                flexShrink: 0, padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${active ? c : '#E2E8F0'}`, background: active ? c : '#fff', color: active ? '#fff' : '#334155',
              }}>{e} <span style={{ opacity: 0.75, fontSize: 10 }}>{grouped[e].length}</span></button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {grouped[stage].length === 0 && (
            <EmptyState compact icon="—" title={`Rien en « ${stage} » pour l’instant.`} />
          )}
          {grouped[stage].map(o => (
            <OpportuniteCard key={o.id} o={o} contact={contactsById.get(o.contact_id)}
              dormant={daysSinceLastInteraction(o, interactions)}
              onOpen={() => onOpen(o)}
              onCall={() => onCall(o)}
              onAdvance={nextEtape(o.etape) ? () => onMove(o, nextEtape(o.etape)) : null} />
          ))}
          <button onClick={() => onNew(stage)} style={{ ...btnS, fontSize: 12, border: '1px dashed #CBD5E1', background: '#fff' }}>
            + Ajouter en « {stage} »
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
        {ETAPES_ACTIVES.map(etape => {
          const list = grouped[etape]
          const total = list.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
          const color = ETAPE_COLORS[etape]
          return (
            <div key={etape}
              onDragOver={(e) => { e.preventDefault(); setDragOver(etape) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); onDrop(etape) }}
              style={{
                flex: '1 0 250px', minWidth: 250, maxWidth: 320,
                background: dragOver === etape ? color + '12' : '#F8FAFC',
                border: `1px solid ${dragOver === etape ? color : '#E2E8F0'}`,
                borderRadius: 12, padding: 10, transition: 'background .15s, border-color .15s',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', flex: 1 }}>{etape}</span>
                <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{list.length}{total ? ` · ${fmtMoney(total)}` : ''}</span>
              </div>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
                {list.map(o => (
                  <OpportuniteCard key={o.id} o={o} contact={contactsById.get(o.contact_id)}
                    dormant={daysSinceLastInteraction(o, interactions)}
                    draggable
                    onDragStart={() => setDragged(o)}
                    onDragEnd={() => { setDragged(null); setDragOver(null) }}
                    onOpen={() => onOpen(o)}
                    onCall={() => onCall(o)}
                    onAdvance={nextEtape(o.etape) ? () => onMove(o, nextEtape(o.etape)) : null} />
                ))}
                <button onClick={() => onNew(etape)} title={`Nouvelle affaire directement en « ${etape} »`} style={{
                  background: 'transparent', border: '1px dashed #CBD5E1', borderRadius: 10, padding: '8px', fontSize: 11,
                  color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}>+ Ajouter ici</button>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
        💡 Glisse une carte vers une autre colonne pour la faire avancer. Clique dessus pour voir la fiche.
      </div>
    </div>
  )
}
