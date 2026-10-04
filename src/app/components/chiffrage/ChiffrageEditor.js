'use client'
// Éditeur du DPGF : paramètres (description, surface, aléas, TVA), lots et
// postes (désignation, quantité, unité, PU HT). Totaux et contrôles de bon
// sens recalculés à la frappe. Rien n'est enregistré avant « Enregistrer ».
import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import { inp, sel, btnP, btnS, fmtMoney } from '../../dashboards/shared'
import { UNITES, newId, normalizeLots, chiffrageTotals, sanityChecks, lotTotal, posteTotal, refsIndex, refFor } from '../../lib/chiffrage'
import { useToast } from '../../contexts/ToastContext'

const small = { ...inp, minHeight: 38, padding: '7px 9px', fontSize: 14 }
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14, padding: '4px 6px', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 3 }

const toDraft = (c) => ({
  description: c?.description || '',
  surface_m2: c?.surface_m2 ? String(c.surface_m2) : '',
  aleas_pct: c?.aleas_pct != null ? String(c.aleas_pct) : '5',
  tva_pct: c?.tva_pct != null ? String(c.tva_pct) : '20',
  source: c?.source || 'manuel',
  hypotheses: c?.hypotheses || [],
  conseils: c?.conseils || [],
  lots: (c?.lots || []).map(l => ({
    id: l.id || newId('l'), nom: l.nom || '',
    postes: (l.postes || []).map(p => ({ id: p.id || newId('p'), designation: p.designation || '', quantite: String(p.quantite ?? ''), unite: p.unite || 'u', pu_ht: String(p.pu_ht ?? '') })),
  })),
})
const dec = (v) => String(v ?? '').replace(',', '.')

export default function ChiffrageEditor({ open, initial, chantier, refs = [], onClose, onSave }) {
  const { addToast } = useToast()
  const [d, setD] = useState(() => toDraft(initial))
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setD(toDraft(initial)); setSaving(false) } }, [open, initial])

  const clean = useMemo(() => ({
    lots: normalizeLots(d.lots.map(l => ({ ...l, postes: l.postes.map(p => ({ ...p, quantite: dec(p.quantite), pu_ht: dec(p.pu_ht) })) }))),
    surface_m2: dec(d.surface_m2), aleas_pct: dec(d.aleas_pct), tva_pct: dec(d.tva_pct),
  }), [d])
  const totals = useMemo(() => chiffrageTotals(clean), [clean])
  const checks = useMemo(() => sanityChecks(clean), [clean])
  // Prix payés dans les OS pour un poste identique (désignation + unité)
  const refIdx = useMemo(() => refsIndex(refs), [refs])

  const setLot = (id, fn) => setD(s => ({ ...s, lots: s.lots.map(l => l.id === id ? fn(l) : l) }))
  const setPoste = (lotId, pid, patch) => setLot(lotId, l => ({ ...l, postes: l.postes.map(p => p.id === pid ? { ...p, ...patch } : p) }))
  const addPoste = (lotId) => setLot(lotId, l => ({ ...l, postes: [...l.postes, { id: newId('p'), designation: '', quantite: '1', unite: 'ens', pu_ht: '' }] }))
  const delPoste = (lotId, pid) => setLot(lotId, l => ({ ...l, postes: l.postes.filter(p => p.id !== pid) }))
  const addLot = () => setD(s => ({ ...s, lots: [...s.lots, { id: newId('l'), nom: '', postes: [] }] }))
  const delLot = (id) => setD(s => ({ ...s, lots: s.lots.filter(l => l.id !== id) }))
  const moveLot = (id, dir) => setD(s => {
    const i = s.lots.findIndex(l => l.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= s.lots.length) return s
    const lots = [...s.lots];[lots[i], lots[j]] = [lots[j], lots[i]]
    return { ...s, lots }
  })

  const submit = async () => {
    if (!clean.lots.length) { addToast('Ajoute au moins un lot', 'error'); return }
    if (clean.lots.some(l => !l.nom)) { addToast('Chaque lot doit avoir un nom', 'error'); return }
    setSaving(true)
    try {
      await onSave({ ...clean, description: d.description.trim(), source: d.source })
    } catch (e) {
      addToast(e?.message || 'Erreur enregistrement', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={`DPGF — ${chantier?.nom || ''}`} wide="xl">
      {(d.hypotheses.length > 0 || d.conseils.length > 0) && (
        <div style={{ fontSize: 12, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#075985' }}>
          {d.hypotheses.length > 0 && <><b>Hypothèses à confirmer</b><ul style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{d.hypotheses.map(h => <li key={h}>{h}</li>)}</ul></>}
          {d.conseils.length > 0 && <><b>Conseils</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{d.conseils.map(h => <li key={h}>{h}</li>)}</ul></>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 260px' }}>
          <span style={label}>Description du projet</span>
          <textarea value={d.description} onChange={e => setD(s => ({ ...s, description: e.target.value }))} rows={2} style={{ ...small, resize: 'vertical' }} />
        </div>
        <div style={{ width: 100 }}><span style={label}>Surface m²</span>
          <input inputMode="decimal" value={d.surface_m2} onChange={e => setD(s => ({ ...s, surface_m2: e.target.value }))} style={small} /></div>
        <div style={{ width: 90 }}><span style={label}>Aléas %</span>
          <input inputMode="decimal" value={d.aleas_pct} onChange={e => setD(s => ({ ...s, aleas_pct: e.target.value }))} style={small} /></div>
        <div style={{ width: 100 }}><span style={label}>TVA %</span>
          <select value={d.tva_pct} onChange={e => setD(s => ({ ...s, tva_pct: e.target.value }))} style={{ ...sel, ...small }}>
            {['20', '10', '5.5', '0'].map(v => <option key={v} value={v}>{v.replace('.', ',')} %</option>)}
          </select></div>
      </div>

      {d.lots.map((l, i) => (
        <div key={l.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>{i + 1}.</span>
            <input aria-label="Nom du lot" value={l.nom} onChange={e => setLot(l.id, x => ({ ...x, nom: e.target.value }))} placeholder="Nom du lot" style={{ ...small, fontWeight: 700, flex: 1 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{fmtMoney(lotTotal(clean.lots.find(c => c.id === l.id) || l))}</span>
            <button title="Monter" onClick={() => moveLot(l.id, -1)} style={iconBtn}>↑</button>
            <button title="Descendre" onClick={() => moveLot(l.id, 1)} style={iconBtn}>↓</button>
            <button title="Supprimer le lot" aria-label="Supprimer le lot" onClick={() => delLot(l.id)} style={{ ...iconBtn, color: '#DC2626' }}>✕</button>
          </div>
          {l.postes.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6, paddingLeft: 14 }}>
              <input aria-label="Désignation" value={p.designation} onChange={e => setPoste(l.id, p.id, { designation: e.target.value })} placeholder="Désignation" style={{ ...small, flex: '1 1 240px' }} />
              <input aria-label="Quantité" inputMode="decimal" value={p.quantite} onChange={e => setPoste(l.id, p.id, { quantite: e.target.value })} style={{ ...small, width: 72, textAlign: 'right' }} />
              <select aria-label="Unité" value={UNITES.includes(p.unite) ? p.unite : 'u'} onChange={e => setPoste(l.id, p.id, { unite: e.target.value })} style={{ ...sel, ...small, width: 82 }}>
                {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input aria-label="Prix unitaire HT" inputMode="decimal" value={p.pu_ht} onChange={e => setPoste(l.id, p.id, { pu_ht: e.target.value })} placeholder="PU HT" style={{ ...small, width: 96, textAlign: 'right' }} />
              <span style={{ width: 92, textAlign: 'right', fontSize: 13, color: '#334155' }}>{fmtMoney(posteTotal({ quantite: dec(p.quantite), pu_ht: dec(p.pu_ht) }))}</span>
              {(() => {
                const r = refFor(refIdx, p)
                if (!r) return null
                const same = Math.abs(Number(dec(p.pu_ht)) - r.pu_ht) < 0.01
                const range = r.nb > 1 && r.min !== r.max ? ` · ${r.min}–${r.max} €` : ''
                return (
                  <button type="button" disabled={same} onClick={() => setPoste(l.id, p.id, { pu_ht: String(r.pu_ht).replace('.', ',') })}
                    title={`Prix payé dans ${r.nb} OS${r.metier ? ` (${r.metier})` : ''}${range}${same ? '' : ' — cliquer pour l’appliquer'}`}
                    style={{ fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '2px 7px', fontFamily: 'inherit', cursor: same ? 'default' : 'pointer',
                      border: `1px solid ${same ? '#A7F3D0' : '#FDE68A'}`, background: same ? '#ECFDF5' : '#FFFBEB', color: same ? '#047857' : '#92400E' }}>
                    OS {String(r.pu_ht).replace('.', ',')} €{r.nb > 1 ? ` ×${r.nb}` : ''}
                  </button>
                )
              })()}
              <button title="Supprimer le poste" aria-label="Supprimer le poste" onClick={() => delPoste(l.id, p.id)} style={iconBtn}>✕</button>
            </div>
          ))}
          <button onClick={() => addPoste(l.id)} style={{ ...iconBtn, color: '#0284C7', fontWeight: 700, fontSize: 12, paddingLeft: 14 }}>+ Poste</button>
        </div>
      ))}
      <button onClick={addLot} style={{ ...btnS, fontSize: 12, padding: '7px 12px', marginBottom: 14 }}>+ Lot</button>

      {checks.length > 0 && (
        <ul style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px 8px 26px', margin: '0 0 12px' }}>
          {checks.map(c => <li key={c}>{c}</li>)}
        </ul>
      )}

      <div style={{ position: 'sticky', bottom: -1, background: '#fff', borderTop: '1px solid #E2E8F0', paddingTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#475569' }}>
          Travaux HT <b>{fmtMoney(totals.ht)}</b>
          {totals.aleas > 0 && <> · aléas {fmtMoney(totals.aleas)}</>}
          {' '}· TTC <b>{fmtMoney(totals.ttc)}</b>
          {totals.parM2 && <> · {fmtMoney(totals.parM2)} HT/m²</>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnS}>Annuler</button>
          <button onClick={submit} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  )
}
