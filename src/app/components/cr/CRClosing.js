'use client'
import { field, label, NAVY } from './crStyles'
import MicButton from './MicButton'

const FIELDS = [
  ['resume', 'Synthèse de la réunion', 'Points marquants, état général du chantier…'],
  ['alertes', 'Alertes : retards, non-conformités, risques', 'Ex : Retard de 2 semaines du lot plâtrerie, imputable à l’entreprise X : décale la pose du carrelage.'],
  ['decisions', 'Décisions', 'Décisions prises pendant la réunion, par qui, avec leur impact (coût, délai)…'],
]

/**
 * Fin du compte rendu : synthèse, alertes, décisions (dictables) et
 * convocation à la prochaine réunion.
 */
export default function CRClosing({ form, setForm, dictation, m }) {
  const next = form.prochaine_reunion || {}
  const setNext = (p) => setForm({ prochaine_reunion: { ...next, ...p } })
  return (
    <>
      {FIELDS.map(([k, title, ph]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={label}>{title}</span>
            <MicButton active={dictation.target === k}
              onClick={() => dictation.toggle(k, (t) => setForm({ [k]: form[k] ? `${String(form[k]).trimEnd()} ${t}` : t }))} />
          </div>
          <textarea aria-label={title} value={form[k] || ''} onChange={e => setForm({ [k]: e.target.value })}
            rows={m ? 4 : 3} placeholder={ph} style={{ ...field, resize: 'vertical' }} />
          {dictation.target === k && dictation.interim && <div style={{ fontSize: 12, color: 'var(--label-secondary)', fontStyle: 'italic' }}>{dictation.interim}…</div>}
        </div>
      ))}
      <span style={{ ...label, color: NAVY, marginTop: 6 }}>Prochaine réunion — convocation</span>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : '1fr 0.7fr 2fr', gap: 10 }}>
        <div>
          <span style={label}>Date</span>
          <input type="date" aria-label="Date de la prochaine réunion" value={next.date || ''} style={field}
            onChange={e => setNext({ date: e.target.value })} />
        </div>
        <div>
          <span style={label}>Heure</span>
          <input type="time" aria-label="Heure de la prochaine réunion" value={next.heure || ''} style={field}
            onChange={e => setNext({ heure: e.target.value })} />
        </div>
        <div style={{ gridColumn: m ? '1 / -1' : 'auto' }}>
          <span style={label}>Lieu</span>
          <input aria-label="Lieu de la prochaine réunion" value={next.lieu || ''} placeholder="Sur le chantier" style={field}
            onChange={e => setNext({ lieu: e.target.value })} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--label-secondary)', margin: '6px 0 0' }}>
        Imprimée en page de garde, ajoutée à l&apos;agenda et envoyée aux intervenants convoqués. Laisse la date vide s&apos;il n&apos;y a pas de réunion suivante.
      </p>
    </>
  )
}
