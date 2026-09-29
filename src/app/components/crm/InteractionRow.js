import { Icon, I, fmtDate } from '../../dashboards/shared'
import { INTERACTION_ICONS } from '../../lib/crm'
import { todayISO } from './crmUi'

// Un échange (appel, email…) avec sa relance éventuelle à cocher
export default function InteractionRow({ it, onToggle, onDelete, context }) {
  const td = todayISO()
  const pending = it.prochaine_action_date && !it.action_faite
  const overdue = pending && it.prochaine_action_date < td
  const dateStr = it.date ? new Date(it.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''
  return (
    <div style={{
      display: 'flex', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', minWidth: 0,
      borderLeft: `3px solid ${overdue ? '#EF4444' : pending ? '#F59E0B' : '#E2E8F0'}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden="true">{INTERACTION_ICONS[it.type] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
          {it.sujet}
          <span style={{ fontSize: 10, color: '#64748B', fontWeight: 400, marginLeft: 6 }}>{dateStr}</span>
        </div>
        {context && <div style={{ fontSize: 10, color: '#64748B' }}>{context}</div>}
        {it.contenu && <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', marginTop: 2 }}>{it.contenu}</div>}
        {it.prochaine_action && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, cursor: 'pointer',
            color: it.action_faite ? '#94A3B8' : overdue ? '#DC2626' : '#92400E', textDecoration: it.action_faite ? 'line-through' : 'none' }}>
            <input type="checkbox" checked={!!it.action_faite} onChange={onToggle} aria-label="Marquer la relance comme faite" />
            {it.prochaine_action}{it.prochaine_action_date ? ` — ${fmtDate(it.prochaine_action_date)}` : ''}{overdue ? ' (en retard)' : ''}
          </label>
        )}
      </div>
      {onDelete && (
        <button onClick={onDelete} title="Supprimer" aria-label="Supprimer l'échange"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, alignSelf: 'flex-start', display: 'flex' }}>
          <Icon d={I.trash} size={12} color="#94A3B8" />
        </button>
      )}
    </div>
  )
}
