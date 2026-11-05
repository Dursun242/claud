'use client'
import { memo } from 'react'
import { formatDate, statusColor, decisionColor } from './pvStatusHelpers'

// Ligne de liste d'un PV — memoïsée : sur une page qui contient N PV,
// ouvrir la modale détail ne provoquera PAS le re-render de toutes les
// autres lignes (les props `pv` et `onDetail` restent stables).
function PVRowImpl({ pv, onDetail }) {
  const sigStatus = statusColor(pv.statut_signature)
  const decStatus = decisionColor(pv.statut_reception)

  return (
    <button
      onClick={() => onDetail(pv)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        marginBottom: 8,
        background: '#fff',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--label)', whiteSpace: 'nowrap' }}>
            {pv.numero}
          </span>
          <span style={{
            padding: '3px 7px', background: sigStatus.bg, color: sigStatus.color,
            borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {pv.statut_signature}
          </span>
          <span style={{
            padding: '3px 7px', background: decStatus.bg, color: decStatus.color,
            borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {pv.statut_reception}
          </span>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--label-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {pv.titre} • {formatDate(pv.date_reception)}
        </div>
      </div>
    </button>
  )
}

const PVRow = memo(PVRowImpl)
export default PVRow
