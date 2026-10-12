import { FF, inp, sel, btnP, btnS } from '../../dashboards/shared'
import { Modal, ContactPicker, AddressPicker } from '../index'
import { ETAPES, ETAPE_COLORS, ETAPE_PROBA, SOURCES, MOTIFS_ATTENTE, REPRISES, isClosed, isAttente, addMonthsISO } from '../../lib/crm'
import { localISO } from '../../lib/today'
import { TYPES_PROJET } from './crmUi'

const chip = (active, color, tint) => ({
  padding: '4px 9px', borderRadius: 999, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', minHeight: 28,
  border: `1px solid ${active ? color : 'var(--separator)'}`, background: active ? tint : '#fff', color: 'var(--label-2)',
})

// Formulaire de création / modification d'une affaire (mode : 'new' | 'edit' | null)
export default function OpportuniteFormModal({
  mode, form, setForm, error, saving, moreOptions, setMoreOptions, m,
  contacts, onCreateContact, onSave, onClose,
}) {
  return (
    <Modal open={!!mode} onClose={onClose}
      title={mode === 'new' ? 'Nouvelle affaire'
        : form.etape === 'Perdu' && !form.motif_perte ? 'Affaire perdue'
        : isAttente(form.etape) && !form.date_reprise_initiale ? 'Mettre en attente'
        : "Modifier l'affaire"}>
      <FF label="Nom de l'affaire" required>
        <input style={inp} value={form.titre || ''} autoFocus
          onChange={e => setForm({ ...form, titre: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave() } }}
          placeholder="Ex : Rénovation maison Dupont" />
      </FF>
      <FF label="Étape">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ETAPES.map(e => {
            const active = (form.etape || 'Prospect') === e
            const c = ETAPE_COLORS[e]
            return (
              <button key={e} type="button" aria-pressed={active}
                onClick={() => setForm({
                  ...form, etape: e, probabilite: isClosed(e) ? ETAPE_PROBA[e] : (form.probabilite || ETAPE_PROBA[e]),
                  ...(isAttente(e) && !form.date_reprise ? { date_reprise: addMonthsISO(localISO(), 6) } : {}),
                })}
                style={{
                  padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? c : 'var(--separator)'}`, background: active ? c : '#fff', color: active ? '#fff' : 'var(--label-2)',
                }}>{e}</button>
            )
          })}
        </div>
      </FF>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="Client / contact" hint={!form.contact_id ? 'Tape un nom ; s’il n’existe pas, tu peux le créer ici.' : undefined}>
          <ContactPicker contacts={contacts} value={form.contact_id || ''}
            onChange={(id) => setForm(f => ({ ...f, contact_id: id }))}
            onCreate={onCreateContact} />
        </FF>
        <FF label="Montant estimé (€ HT)">
          <input style={inp} type="number" min={0} step={100} inputMode="decimal" placeholder="0"
            value={form.montant_estime ?? ''}
            onChange={e => setForm({ ...form, montant_estime: e.target.value })} />
        </FF>
      </div>
      {form.etape === 'Perdu' && (
        <FF label="Pourquoi est-elle perdue ?" required>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {['Prix', 'Délai', 'Concurrent', 'Projet abandonné', 'Sans réponse'].map(mtf => (
              <button key={mtf} type="button" onClick={() => setForm({ ...form, motif_perte: mtf })} style={{
                padding: '4px 9px', borderRadius: 999, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${form.motif_perte === mtf ? 'var(--red)' : 'var(--separator)'}`, background: form.motif_perte === mtf ? 'var(--red-tint)' : '#fff', color: 'var(--label-2)',
              }}>{mtf}</button>
            ))}
          </div>
          <input style={inp} value={form.motif_perte || ''} placeholder="Ou précise…"
            onChange={e => setForm({ ...form, motif_perte: e.target.value })} />
        </FF>
      )}

      {isAttente(form.etape) && (<>
        <FF label="Pourquoi le projet est-il en pause ?">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {MOTIFS_ATTENTE.map(({ motif, mois }) => (
              <button key={motif} type="button" aria-pressed={form.motif_attente === motif}
                onClick={() => setForm({ ...form, motif_attente: motif, date_reprise: addMonthsISO(localISO(), mois) })}
                style={chip(form.motif_attente === motif, 'var(--indigo)', 'var(--indigo-tint)')}>{motif}</button>
            ))}
          </div>
          <input style={inp} value={form.motif_attente || ''} placeholder="Ou précise…"
            onChange={e => setForm({ ...form, motif_attente: e.target.value })} />
        </FF>
        <FF label="Reprendre contact le" required hint="Un rappel apparaîtra dans les relances à cette date.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {REPRISES.map(({ mois, label }) => {
              const d = addMonthsISO(localISO(), mois)
              return (
                <button key={mois} type="button" aria-pressed={form.date_reprise === d}
                  onClick={() => setForm({ ...form, date_reprise: d })}
                  style={chip(form.date_reprise === d, 'var(--indigo)', 'var(--indigo-tint)')}>dans {label}</button>
              )
            })}
          </div>
          <input style={inp} type="date" value={form.date_reprise || ''} min={localISO()}
            aria-label="Date de reprise de contact"
            onChange={e => setForm({ ...form, date_reprise: e.target.value })} />
        </FF>
      </>)}

      <button type="button" onClick={() => setMoreOptions(v => !v)} aria-expanded={moreOptions}
        style={{ background: 'none', border: 'none', padding: '4px 0', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}>
        {moreOptions ? '▾ Moins d’options' : '▸ Plus d’options (chances, type, source, adresse, date, notes)'}
      </button>
      {moreOptions && (
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
          <FF label="Chances de gagner (%)" hint={isClosed(form.etape) ? 'Fixé par l’étape' : `Par défaut ${ETAPE_PROBA[form.etape] ?? 20} % à cette étape`}>
            <input style={inp} type="number" min={0} max={100} inputMode="numeric"
              disabled={isClosed(form.etape)}
              value={form.probabilite ?? ''}
              onChange={e => setForm({ ...form, probabilite: e.target.value })} />
          </FF>
          <FF label="Type de projet">
            <select style={sel} value={form.type_projet || ''}
              onChange={e => setForm({ ...form, type_projet: e.target.value })}>
              <option value="">—</option>
              {TYPES_PROJET.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="D'où vient ce contact ?">
            <select style={sel} value={form.source || ''}
              onChange={e => setForm({ ...form, source: e.target.value })}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FF>
          <FF label="Adresse du projet">
            <AddressPicker value={form.adresse || ''}
              onChange={v => setForm(f => ({ ...f, adresse: v }))} />
          </FF>
          <FF label="Décision attendue le">
            <input style={inp} type="date" value={form.date_cloture_prevue || ''}
              onChange={e => setForm({ ...form, date_cloture_prevue: e.target.value })} />
          </FF>
          <div style={{ gridColumn: '1 / -1' }}>
            <FF label="Notes">
              <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={form.notes || ''}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </FF>
          </div>
        </div>
      )}
      {error && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnS}>Annuler</button>
        <button onClick={onSave} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  )
}
