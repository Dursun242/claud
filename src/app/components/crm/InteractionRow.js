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
      display: 'flex', gap: 10, background: '#fff', borderRadius: 10, padding: '8px 12px', minWidth: 0,
      // Action en retard (rouge) ou à venir (orange) : contour teinté
      border: `1px solid ${overdue ? '#FFC9C6' : pending ? '#FFDDA6' : '#E5E5EA'}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden="true">{INTERACTION_ICONS[it.type] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1C1E' }}>
          {it.sujet}
          <span style={{ fontSize: 11, color: '#6E6E73', fontWeight: 400, marginLeft: 6 }}>{dateStr}</span>
        </div>
        {context && <div style={{ fontSize: 11, color: '#6E6E73' }}>{context}</div>}
        {it.contenu && <div style={{ fontSize: 12, color: '#48484A', whiteSpace: 'pre-wrap', marginTop: 2 }}>{it.contenu}</div>}
        {it.prochaine_action && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, cursor: 'pointer',
            color: it.action_faite ? '#8E8E93' : overdue ? '#D70015' : '#A0390C', textDecoration: it.action_faite ? 'line-through' : 'none' }}>
            <input type="checkbox" checked={!!it.action_faite} onChange={onToggle} aria-label="Marquer la relance comme faite" />
            {it.prochaine_action}{it.prochaine_action_date ? ` — ${fmtDate(it.prochaine_action_date)}` : ''}{overdue ? ' (en retard)' : ''}
          </label>
        )}
      </div>
      {onDelete && (
        <button onClick={onDelete} title="Supprimer" aria-label="Supprimer l'échange"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, alignSelf: 'flex-start', display: 'flex' }}>
          <Icon d={I.trash} size={12} color="#8E8E93" />
        </button>
      )}
    </div>
  )
}
