import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import { INTERACTION_TYPES, INTERACTION_ICONS } from '../../lib/crm'
import { RELANCE_CHIPS, chip, isAutoSujet, defaultSujet } from './crmUi'

// « Noter un échange » : type, sujet, contenu, relance en un clic
export default function InteractionFormModal({ open, form, setForm, error, saving, contactsById, onSave, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Noter un échange">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {INTERACTION_TYPES.map(t => {
          const active = form.type === t
          return (
            <button key={t} type="button" aria-pressed={active}
              onClick={() => setForm(f => ({ ...f, type: t, sujet: isAutoSujet(f.sujet) ? defaultSujet(t, contactsById.get(f.contact_id)) : f.sujet }))}
              style={{
                padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${active ? '#1E3A5F' : '#E2E8F0'}`, background: active ? '#1E3A5F' : '#fff', color: active ? '#fff' : '#334155',
              }}>{INTERACTION_ICONS[t]} {t}</button>
          )
        })}
      </div>
      <FF label="Sujet" required>
        <input style={inp} value={form.sujet || ''} autoFocus
          onChange={e => setForm({ ...form, sujet: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave() } }} />
      </FF>
      <FF label="Ce qui s'est dit" hint="Optionnel">
        <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.contenu || ''}
          placeholder="Ex : il attend le devis avant fin de mois, budget max 40 k€…"
          onChange={e => setForm({ ...form, contenu: e.target.value })} />
      </FF>
      <FF label="Relancer">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setForm({ ...form, prochaine_action_date: '', prochaine_action: '' })}
            aria-pressed={!form.prochaine_action_date}
            style={chip(!form.prochaine_action_date, '#64748B')}>Pas de relance</button>
          {RELANCE_CHIPS.map(c => {
            const d = c.d(); const active = form.prochaine_action_date === d
            return (
              <button key={c.l} type="button" aria-pressed={active}
                onClick={() => setForm({ ...form, prochaine_action_date: d, prochaine_action: form.prochaine_action || 'Rappeler' })}
                style={chip(active, '#F59E0B')}>{c.l}</button>
            )
          })}
          <input type="date" aria-label="Autre date de relance" value={form.prochaine_action_date || ''}
            onChange={e => setForm({ ...form, prochaine_action_date: e.target.value, prochaine_action: form.prochaine_action || (e.target.value ? 'Rappeler' : '') })}
            style={{ ...inp, width: 'auto', minHeight: 34, padding: '4px 8px', fontSize: 12 }} />
        </div>
      </FF>
      {form.prochaine_action_date && (
        <FF label="Quoi faire ce jour-là ?">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {['Rappeler', 'Envoyer le devis', 'Relancer par email', 'Planifier une visite'].map(a => (
              <button key={a} type="button" onClick={() => setForm({ ...form, prochaine_action: a })}
                style={chip(form.prochaine_action === a, '#3B82F6')}>{a}</button>
            ))}
          </div>
          <input style={inp} value={form.prochaine_action || ''}
            onChange={e => setForm({ ...form, prochaine_action: e.target.value })} />
        </FF>
      )}
      {error && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnS}>Annuler</button>
        <button onClick={onSave} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : 'Noter'}
        </button>
      </div>
    </Modal>
  )
}
