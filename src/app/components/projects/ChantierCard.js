'use client'
import { memo } from 'react'
import Image from 'next/image'
import { status as statusColors, fmtDate, PBar, Icon, I } from '../../dashboards/shared'
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
  // Dates manquantes : « Dates à renseigner » au lieu de « Invalid Date »
  const hasDates = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
  const total = hasDates ? end.getTime() - start.getTime() : 0
  const elapsed = Math.max(0, Math.min(total, now - start.getTime()))
  const progress = total > 0 ? Math.round((elapsed / total) * 100) : 0
  const isDone = ch.statut === 'Terminé'
  // Temps écoulé : marine ; vert une fois le chantier terminé
  const progressColor = isDone ? '#34C759' : '#0071E3'
  const progressText = isDone ? '#1E7B34' : '#3A3A3C'

  return (
    <div
      onClick={() => onOpen(ch)}
      role="link"
      tabIndex={0}
      aria-label={`Ouvrir le chantier ${ch.nom}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(ch) } }}
      className="u-press u-press--lift"
      style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--separator)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
            <span style={{ fontSize: m ? 14 : 16, fontWeight: 700, color: ch.nom ? undefined : 'var(--label-secondary)' }}>{ch.nom || 'Chantier sans nom'}</span>
            <Badge text={ch.phase} color="#6E6E73"/>
            <Badge text={ch.statut} color={statusColors[ch.statut] || '#6E6E73'}/>
          </div>
          <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{ch.client} — {ch.adresse}</div>
          {!readOnly && !ch.client_user_id && ch.client_email && (
            <div style={{ fontSize: 12, color: 'var(--accent-text)', marginTop: 2 }}>Client invité : {ch.client_email} (en attente de sa première connexion)</div>
          )}
          {!readOnly && ch.client && !ch.client_user_id && !ch.client_email && (
            <div style={{ fontSize: 12, color: 'var(--orange-text)', marginTop: 2 }}>Non rattaché à un compte client</div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--label-secondary)' }}>
            <span>{counts.os} OS</span>
            <span>{counts.cr} CR</span>
            <span>{counts.tasks} tâches</span>
            <span>{counts.attachments} PJ</span>
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEdit(ch)}
              aria-label={`Modifier le chantier ${ch.nom}`}
              className="u-icon-btn u-icon-btn--soft"
              style={{
                borderRadius: 8, padding: 5, width: 36, height: 36,
              }}
            >
              <Icon d={I.edit} size={16} color="#48484A"/>
            </button>
            <button
              onClick={() => onDelete(ch)}
              aria-label={`Supprimer le chantier ${ch.nom}`}
              className="u-icon-btn u-icon-btn--danger"
              style={{
                borderRadius: 8, padding: 5, width: 36, height: 36, color: 'var(--label-secondary)',
              }}
            >
              <Icon d={I.trash} size={16}/>
            </button>
          </div>
        )}
      </div>
      <div style={{ padding: `0 ${m ? 14 : 18}px ${m ? 14 : 18}px`, marginTop: -4 }}>
        <PBar value={isDone ? 100 : Math.min(progress, 100)} max={100} color={progressColor}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: 'var(--label-secondary)' }}>
          <span>{hasDates ? `${fmtDate(start)} → ${fmtDate(end)}` : 'Dates à renseigner'}</span>
          <span style={{ color: progressText, fontWeight: 600 }}>
            {isDone ? 'Terminé' : hasDates ? progress + '%' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

const ChantierCard = memo(ChantierCardImpl)
export default ChantierCard
