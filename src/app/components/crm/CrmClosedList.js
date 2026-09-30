import { fmtMoney, fmtDate } from '../../dashboards/shared'
import { Badge, EmptyState } from '../index'
import { ETAPE_COLORS } from '../../lib/crm'

// Vue « Terminées » : affaires gagnées et perdues
export default function CrmClosedList({ list, m, contactsById, chantiers, onOpen }) {
  return (
    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
      {list.length === 0 && (
        <EmptyState icon="🏁" title="Aucune affaire terminée" description="Les affaires gagnées et perdues apparaîtront ici." />
      )}
      {list.map(o => {
        const c = contactsById.get(o.contact_id)
        const ch = chantiers.find(x => x.id === o.chantier_id)
        return (
          <div key={o.id} onClick={() => onOpen(o.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10,
            padding: '10px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.05)', cursor: 'pointer',
            borderLeft: `3px solid ${ETAPE_COLORS[o.etape]}`, minWidth: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>
                {c?.nom || '—'}{o.date_cloture ? ` · le ${fmtDate(o.date_cloture)}` : ''}
                {o.etape === 'Perdu' && o.motif_perte ? ` · ${o.motif_perte}` : ''}
                {ch ? ` · chantier ${ch.nom}` : ''}
              </div>
            </div>
            {!m && <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{fmtMoney(o.montant_estime)}</span>}
            <Badge text={o.etape} color={ETAPE_COLORS[o.etape]} />
          </div>
        )
      })}
    </div>
  )
}
