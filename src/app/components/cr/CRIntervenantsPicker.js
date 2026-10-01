'use client'
import { toCrIntervenant } from '../../lib/crSuivi'

const PRESENCES = [
  { v: 'Présent', short: 'P', color: '#047857', bg: '#ECFDF5' },
  { v: 'Absent', short: 'A', color: '#B91C1C', bg: '#FEF2F2' },
  { v: 'Excusé', short: 'E', color: '#B45309', bg: '#FFFBEB' },
]

const linkBtn = (color) => ({
  background: 'none', border: 'none', color, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
})

/**
 * Intervenants du CR : case « concerné », présence à la réunion
 * (Présent / Absent / Excusé) et convocation à la prochaine réunion.
 * `available` = intervenants du chantier (lib/crSuivi.chantierIntervenants),
 * `value` = entrées enregistrées dans le CR (toCrIntervenant).
 */
export default function CRIntervenantsPicker({ available = [], value = [], onChange, m }) {
  // Intervenants du chantier + ceux déjà dans le CR (ex. repris du CR précédent)
  const byNom = new Map(value.map(v => [v.nom, v]))
  const list = [...available]
  for (const v of value) if (!list.some(a => a.nom === v.nom)) list.push(v)

  if (!list.length) {
    return (
      <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#64748B' }}>
        Aucun intervenant sur ce chantier — ajoutez-en depuis sa fiche (onglet Chantiers), puis revenez ici.
      </div>
    )
  }

  const set = (next) => onChange(list.map(it => next.get(it.nom)).filter(Boolean))
  const toggle = (it) => {
    const next = new Map(byNom)
    if (next.has(it.nom)) next.delete(it.nom)
    else next.set(it.nom, toCrIntervenant(it))
    set(next)
  }
  const patch = (it, p) => {
    const next = new Map(byNom)
    next.set(it.nom, { ...next.get(it.nom), ...p })
    set(next)
  }
  const convoques = value.filter(v => v.convoque !== false).length

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
          {value.length === 0 ? 'Aucun sélectionné' : `${value.length} intervenant${value.length > 1 ? 's' : ''} · ${convoques} convoqué${convoques > 1 ? 's' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" style={linkBtn('#1D4ED8')}
            onClick={() => set(new Map(list.map(it => [it.nom, byNom.get(it.nom) || toCrIntervenant(it)])))}>Tout cocher</button>
          <button type="button" style={linkBtn('#64748B')} onClick={() => onChange([])}>Tout décocher</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map(it => {
          const cur = byNom.get(it.nom)
          const isSel = !!cur
          return (
            <div key={it.id || it.nom} style={{
              display: 'flex', alignItems: m ? 'stretch' : 'center', flexDirection: m ? 'column' : 'row', gap: 8,
              padding: '8px 10px', borderRadius: 6, background: isSel ? '#EFF6FF' : '#fff',
              border: isSel ? '1.5px solid #3B82F6' : '1px solid #E2E8F0',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(it)}
                  style={{ width: 18, height: 18, accentColor: '#3B82F6', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{it.nom}</span>
                  {(it.societe && it.societe !== it.nom) || it.role ? (
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      {' '}· {[it.societe && it.societe !== it.nom ? it.societe : '', it.role].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  {!it.email && <span style={{ fontSize: 10, color: '#B45309' }}> · sans email</span>}
                </span>
              </label>
              {isSel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div role="radiogroup" aria-label={`Présence de ${it.nom}`} style={{ display: 'flex', gap: 3 }}>
                    {PRESENCES.map(p => {
                      const on = (cur.presence || 'Présent') === p.v
                      return (
                        <button key={p.v} type="button" role="radio" aria-checked={on} title={p.v}
                          onClick={() => patch(it, { presence: p.v })}
                          style={{
                            minWidth: 30, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            fontFamily: 'inherit', border: `1.5px solid ${on ? p.color : '#E2E8F0'}`,
                            background: on ? p.bg : '#fff', color: on ? p.color : '#94A3B8',
                          }}>{m ? p.short : p.v}</button>
                      )
                    })}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#1E3A5F', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cur.convoque !== false}
                      onChange={e => patch(it, { convoque: e.target.checked })}
                      style={{ width: 16, height: 16, accentColor: '#1E3A5F' }} />
                    Convoqué
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
