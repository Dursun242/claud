import { fmtMoney } from '../../dashboards/shared'
import { nextEtape } from '../../lib/crm'
import { todayISO, iconBtn } from './crmUi'

// Carte d'une affaire dans le pipeline (Kanban desktop / liste mobile)
export default function OpportuniteCard({ o, contact, dormant, draggable, onDragStart, onDragEnd, onOpen, onCall, onAdvance }) {
  const late = o.date_cloture_prevue && o.date_cloture_prevue < todayISO()
  const isDormant = dormant != null && dormant >= 14
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.() }
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      aria-label={`Ouvrir ${o.titre}`}
      style={{
        background: '#fff', borderRadius: 10, padding: '10px 12px', cursor: draggable ? 'grab' : 'pointer',
        border: '1px solid #E5E5EA', minWidth: 0,
      }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
      <div style={{ fontSize: 11, color: '#6E6E73', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {contact ? (contact.societe || contact.nom) : <span style={{ color: '#6E6E73', fontStyle: 'italic' }}>Sans contact</span>}
        {o.type_projet ? ` · ${o.type_projet}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {Number(o.montant_estime) > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1C1C1E' }}>{fmtMoney(o.montant_estime)}</span>
          : <span style={{ fontSize: 11, color: '#6E6E73' }}>Montant ?</span>}
        <span style={{ flex: 1 }} />
        {late && <span title="Décision attendue dépassée" style={{ fontSize: 11, color: '#D70015', fontWeight: 700 }}>⚠</span>}
        {isDormant && <span title={`Aucun échange depuis ${dormant} j`} style={{ fontSize: 11, color: '#FF9500', fontWeight: 700 }}>💤 {dormant} j</span>}
        {onCall && (
          <button onClick={stop(onCall)} title="Noter un appel" aria-label={`Noter un appel pour ${o.titre}`} style={iconBtn}>📞</button>
        )}
        {onAdvance && (
          <button onClick={stop(onAdvance)} title={`Passer à « ${nextEtape(o.etape)} »`}
            aria-label={`Passer à ${nextEtape(o.etape)}`} style={iconBtn}>→</button>
        )}
      </div>
    </div>
  )
}
