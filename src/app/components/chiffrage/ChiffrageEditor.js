'use client'
// Éditeur du DPGF : en-tête (référence, indice, surfaces, aléas, TVA), lots
// numérotés (lot d'honoraires de maîtrise d'œuvre compris) et postes
// (désignation, quantité, unité, PU HT, verrou). Un prix saisi à la main est
// verrouillé : le calage sur un objectif TTC ne le modifie pas. Totaux,
// ratio TTC/m² (MOE comprise, SHAB + ½ garage) et contrôles recalculés à la
// frappe. Rien n'est enregistré avant « Enregistrer ».
import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import { inp, sel, btnP, btnS, fmtMoney } from '../../dashboards/shared'
import {
  UNITES, newId, normalizeLots, chiffrageTotals, sanityChecks, lotTotal, posteTotal, refsIndex, refFor,
  calerSurObjectif, lotNumero, posteNumero,
} from '../../lib/chiffrage'
import { useToast } from '../../contexts/ToastContext'

const small = { ...inp, minHeight: 38, padding: '7px 9px', fontSize: 14 }
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14, padding: '4px 6px', fontFamily: 'inherit' }
const label = { display: 'block', fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 3 }
const box = { border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, marginBottom: 10 }

const str = (v) => (v == null ? '' : String(v).replace('.', ','))
const dec = (v) => String(v ?? '').replace(/\s/g, '').replace(',', '.')

const toDraft = (c) => ({
  description: c?.description || '',
  reference: c?.reference || '',
  indice: c?.indice || 'A',
  surface_m2: str(c?.surface_m2),
  surface_annexes: str(c?.surface_annexes),
  aleas_pct: c?.aleas_pct != null ? str(c.aleas_pct) : '0',
  tva_pct: c?.tva_pct != null ? String(c.tva_pct) : '20',
  observations: c?.observations || '',
  source: c?.source || 'manuel',
  hypotheses: c?.hypotheses || [],
  conseils: c?.conseils || [],
  lots: (c?.lots || []).map(l => ({
    id: l.id || newId('l'), nom: l.nom || '', honoraires: !!l.honoraires,
    postes: (l.postes || []).map(p => ({
      id: p.id || newId('p'), designation: p.designation || '', quantite: str(p.quantite ?? ''),
      unite: p.unite || 'u', pu_ht: str(p.pu_ht ?? ''), verrou: !!p.verrou,
    })),
  })),
})

// Lot d'honoraires type (devis de maîtrise d'œuvre par phases), à ajuster
const lotHonoraires = () => ({
  id: newId('l'), nom: "HONORAIRES MAÎTRISE D'ŒUVRE", honoraires: true,
  postes: [
    ["Phase 1, Hors d'eau / hors d'air : terrassement, maçonnerie, ravalement, menuiseries, étanchéité", '4', '2300'],
    ['Phase 2, Lots techniques : plâtrerie, chauffage, électricité + Consuel, plomberie', '5', '2300'],
    ['Phase 3, Finitions : sols, peinture, salle de bain, cuisine', '2', '2500'],
  ].map(([designation, quantite, pu_ht]) => ({ id: newId('p'), designation, quantite, unite: 'mois', pu_ht, verrou: true })),
})

export default function ChiffrageEditor({ open, initial, chantier, refs = [], onClose, onSave }) {
  const { addToast } = useToast()
  const [d, setD] = useState(() => toDraft(initial))
  const [saving, setSaving] = useState(false)
  const [cible, setCible] = useState('')
  const [cibleMoe, setCibleMoe] = useState('travaux')
  useEffect(() => { if (open) { setD(toDraft(initial)); setSaving(false); setCible('') } }, [open, initial])

  const clean = useMemo(() => ({
    lots: normalizeLots(d.lots.map(l => ({ ...l, postes: l.postes.map(p => ({ ...p, quantite: dec(p.quantite), pu_ht: dec(p.pu_ht) })) }))),
    surface_m2: dec(d.surface_m2), surface_annexes: dec(d.surface_annexes), aleas_pct: dec(d.aleas_pct), tva_pct: dec(d.tva_pct),
  }), [d])
  const totals = useMemo(() => chiffrageTotals(clean), [clean])
  const checks = useMemo(() => sanityChecks(clean), [clean])
  // Prix payés dans les OS pour un poste identique (désignation + unité)
  const refIdx = useMemo(() => refsIndex(refs), [refs])

  const setLot = (id, fn) => setD(s => ({ ...s, lots: s.lots.map(l => l.id === id ? fn(l) : l) }))
  const setPoste = (lotId, pid, patch) => setLot(lotId, l => ({ ...l, postes: l.postes.map(p => p.id === pid ? { ...p, ...patch } : p) }))
  const addPoste = (lotId) => setLot(lotId, l => ({ ...l, postes: [...l.postes, { id: newId('p'), designation: '', quantite: '1', unite: l.honoraires ? 'mois' : 'u', pu_ht: '', verrou: false }] }))
  const delPoste = (lotId, pid) => setLot(lotId, l => ({ ...l, postes: l.postes.filter(p => p.id !== pid) }))
  const addLot = () => setD(s => ({ ...s, lots: [...s.lots, { id: newId('l'), nom: '', honoraires: false, postes: [] }] }))
  const addHonoraires = () => setD(s => ({ ...s, lots: [lotHonoraires(), ...s.lots] }))
  const delLot = (id) => setD(s => ({ ...s, lots: s.lots.filter(l => l.id !== id) }))
  const moveLot = (id, dir) => setD(s => {
    const i = s.lots.findIndex(l => l.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= s.lots.length) return s
    const lots = [...s.lots];[lots[i], lots[j]] = [lots[j], lots[i]]
    return { ...s, lots }
  })
  const hasHonoraires = d.lots.some(l => l.honoraires)

  const caler = () => {
    const r = calerSurObjectif({ ...clean, cible_ttc: dec(cible), avecHonoraires: cibleMoe === 'moe' })
    if (r.error) { addToast(r.error, 'error'); return }
    const pu = new Map(r.lots.flatMap(l => l.postes.map(p => [p.id, p.pu_ht])))
    setD(s => ({ ...s, lots: s.lots.map(l => ({ ...l, postes: l.postes.map(p => (pu.has(p.id) ? { ...p, pu_ht: str(pu.get(p.id)) } : p)) })) }))
    addToast(`Calé : ${fmtMoney(r.atteint)} TTC (écart ${r.ecart >= 0 ? '+' : ''}${fmtMoney(r.ecart)}), prix verrouillés inchangés`, 'success')
  }

  const submit = async () => {
    if (!clean.lots.length) { addToast('Ajoute au moins un lot', 'error'); return }
    if (clean.lots.some(l => !l.nom)) { addToast('Chaque lot doit avoir un nom', 'error'); return }
    setSaving(true)
    try {
      await onSave({
        ...clean, description: d.description.trim(), source: d.source,
        reference: d.reference.trim(), indice: d.indice.trim(), observations: d.observations.trim(),
      })
    } catch (e) {
      addToast(e?.message || 'Erreur enregistrement', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title={`DPGF — ${chantier?.nom || ''}`} wide="xl">
      {(d.hypotheses.length > 0 || d.conseils.length > 0) && (
        <div style={{ fontSize: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#334155' }}>
          {d.hypotheses.length > 0 && <><b>Hypothèses à confirmer</b><ul style={{ margin: '4px 0 6px', paddingLeft: 18 }}>{d.hypotheses.map(h => <li key={h}>{h}</li>)}</ul></>}
          {d.conseils.length > 0 && <><b>Conseils</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{d.conseils.map(h => <li key={h}>{h}</li>)}</ul></>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ width: 150 }}><span style={label}>Référence</span>
          <input value={d.reference} onChange={e => setD(s => ({ ...s, reference: e.target.value }))} placeholder="DPGF-2026-030" style={small} /></div>
        <div style={{ width: 60 }}><span style={label}>Indice</span>
          <input value={d.indice} onChange={e => setD(s => ({ ...s, indice: e.target.value }))} style={small} /></div>
        <div style={{ width: 96 }}><span style={label}>SHAB m²</span>
          <input inputMode="decimal" value={d.surface_m2} onChange={e => setD(s => ({ ...s, surface_m2: e.target.value }))} style={small} /></div>
        <div style={{ width: 118 }}><span style={label} title="Comptés pour moitié dans le ratio">Garage / annexes m²</span>
          <input inputMode="decimal" value={d.surface_annexes} onChange={e => setD(s => ({ ...s, surface_annexes: e.target.value }))} style={small} /></div>
        <div style={{ width: 76 }}><span style={label}>Aléas %</span>
          <input inputMode="decimal" value={d.aleas_pct} onChange={e => setD(s => ({ ...s, aleas_pct: e.target.value }))} style={small} /></div>
        <div style={{ width: 92 }}><span style={label}>TVA %</span>
          <select value={d.tva_pct} onChange={e => setD(s => ({ ...s, tva_pct: e.target.value }))} style={{ ...sel, ...small }}>
            {['20', '10', '5.5', '0'].map(v => <option key={v} value={v}>{v.replace('.', ',')} %</option>)}
          </select></div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={label}>Opération</span>
        <textarea value={d.description} onChange={e => setD(s => ({ ...s, description: e.target.value }))} rows={2} style={{ ...small, resize: 'vertical' }}
          placeholder="Construction d'une maison individuelle R+1, toitures terrasses, garage accolé…" />
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
        🔒 Un prix saisi à la main est verrouillé : le calage sur un objectif ne le modifie pas.
      </div>

      {d.lots.map((l, i) => {
        const cleanLot = clean.lots.find(c => c.id === l.id) || l
        return (
          <div key={l.id} style={{ ...box, ...(l.honoraires ? { background: '#F8FAFC' } : {}) }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', width: 22 }}>{lotNumero(i)}</span>
              <input aria-label="Nom du lot" value={l.nom} onChange={e => setLot(l.id, x => ({ ...x, nom: e.target.value }))} placeholder="Intitulé du lot" style={{ ...small, fontWeight: 700, flex: '1 1 200px' }} />
              <label title="Honoraires de maîtrise d'œuvre : comptés dans le total de l'opération, pas dans les travaux ni les OS"
                style={{ fontSize: 11, color: '#475569', display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={l.honoraires} onChange={e => setLot(l.id, x => ({ ...x, honoraires: e.target.checked }))} /> Honoraires
              </label>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{fmtMoney(lotTotal(cleanLot))}</span>
              <button title="Monter" onClick={() => moveLot(l.id, -1)} style={iconBtn}>↑</button>
              <button title="Descendre" onClick={() => moveLot(l.id, 1)} style={iconBtn}>↓</button>
              <button title="Supprimer le lot" aria-label="Supprimer le lot" onClick={() => delLot(l.id)} style={{ ...iconBtn, color: '#DC2626' }}>✕</button>
            </div>
            {l.postes.map((p, j) => {
              const r = l.honoraires ? null : refFor(refIdx, p)
              const sameRef = r && Math.abs(Number(dec(p.pu_ht)) - r.pu_ht) < 0.01
              return (
                <div key={p.id} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#64748B', width: 34, textAlign: 'right' }}>{posteNumero(i, j)}</span>
                  <input aria-label="Désignation" value={p.designation} onChange={e => setPoste(l.id, p.id, { designation: e.target.value })} placeholder="Désignation" style={{ ...small, flex: '1 1 240px' }} />
                  <input aria-label="Quantité" inputMode="decimal" value={p.quantite} onChange={e => setPoste(l.id, p.id, { quantite: e.target.value })} style={{ ...small, width: 72, textAlign: 'right' }} />
                  <select aria-label="Unité" value={UNITES.includes(p.unite) ? p.unite : 'u'} onChange={e => setPoste(l.id, p.id, { unite: e.target.value })} style={{ ...sel, ...small, width: 82 }}>
                    {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input aria-label="Prix unitaire HT" inputMode="decimal" value={p.pu_ht} onChange={e => setPoste(l.id, p.id, { pu_ht: e.target.value, verrou: true })} placeholder="PU HT" style={{ ...small, width: 96, textAlign: 'right' }} />
                  <button type="button" aria-label={p.verrou ? 'Déverrouiller le prix' : 'Verrouiller le prix'} aria-pressed={p.verrou}
                    title={p.verrou ? 'Prix verrouillé : inchangé par le calage (cliquer pour libérer)' : 'Prix libre : ajusté par le calage (cliquer pour verrouiller)'}
                    onClick={() => setPoste(l.id, p.id, { verrou: !p.verrou })} style={{ ...iconBtn, opacity: p.verrou ? 1 : 0.35 }}>🔒</button>
                  <span style={{ width: 92, textAlign: 'right', fontSize: 13, color: '#334155' }}>{fmtMoney(posteTotal({ quantite: dec(p.quantite), pu_ht: dec(p.pu_ht) }))}</span>
                  {r && (
                    <button type="button" disabled={sameRef} onClick={() => setPoste(l.id, p.id, { pu_ht: str(r.pu_ht), verrou: true })}
                      title={`Prix payé dans ${r.nb} OS${r.metier ? ` (${r.metier})` : ''}${r.nb > 1 && r.min !== r.max ? ` · ${r.min}–${r.max} €` : ''}${sameRef ? '' : ' — cliquer pour l’appliquer'}`}
                      style={{ fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '2px 7px', fontFamily: 'inherit', cursor: sameRef ? 'default' : 'pointer',
                        border: `1px solid ${sameRef ? '#A7F3D0' : '#FDE68A'}`, background: sameRef ? '#ECFDF5' : '#FFFBEB', color: sameRef ? '#047857' : '#92400E' }}>
                      OS {str(r.pu_ht)} €{r.nb > 1 ? ` ×${r.nb}` : ''}
                    </button>
                  )}
                  <button title="Supprimer le poste" aria-label="Supprimer le poste" onClick={() => delPoste(l.id, p.id)} style={iconBtn}>✕</button>
                </div>
              )
            })}
            <button onClick={() => addPoste(l.id)} style={{ ...iconBtn, color: '#0284C7', fontWeight: 700, fontSize: 12, paddingLeft: 40 }}>+ Poste</button>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={addLot} style={{ ...btnS, fontSize: 12, padding: '7px 12px' }}>+ Lot</button>
        {!hasHonoraires && <button onClick={addHonoraires} style={{ ...btnS, fontSize: 12, padding: '7px 12px' }}>+ Lot honoraires MOE</button>}
      </div>

      {/* Calage sur un objectif de prix (prix verrouillés et honoraires inchangés) */}
      <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 150 }}><span style={label}>Objectif TTC</span>
          <input inputMode="decimal" value={cible} onChange={e => setCible(e.target.value)} placeholder="300 000" style={small} /></div>
        <div style={{ width: 190 }}><span style={label}>Portant sur</span>
          <select value={cibleMoe} onChange={e => setCibleMoe(e.target.value)} style={{ ...sel, ...small }}>
            <option value="travaux">les travaux seuls</option>
            <option value="moe">travaux + honoraires</option>
          </select></div>
        <button onClick={caler} disabled={!dec(cible)} style={{ ...btnS, fontSize: 12, padding: '9px 12px', opacity: dec(cible) ? 1 : 0.6 }}>Caler les prix libres</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={label}>Observations / non compris (une par ligne)</span>
        <textarea value={d.observations} onChange={e => setD(s => ({ ...s, observations: e.target.value }))} rows={4} style={{ ...small, resize: 'vertical' }}
          placeholder={"Fondations sous réserve de l'étude de sol G2.\nNon compris : piscine, clôtures, espaces verts…"} />
      </div>

      {checks.length > 0 && (
        <ul style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px 8px 26px', margin: '0 0 12px' }}>
          {checks.map(c => <li key={c}>{c}</li>)}
        </ul>
      )}

      <div style={{ position: 'sticky', bottom: -1, background: '#fff', borderTop: '1px solid #E2E8F0', paddingTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div data-testid="chiffrage-totaux" style={{ fontSize: 12, color: '#475569' }}>
          Travaux <b>{fmtMoney(totals.htAleas)} HT</b>
          {totals.honoraires > 0 && <> · Honoraires {fmtMoney(totals.honoraires)} HT</>}
          {' '}· Total <b>{fmtMoney(totals.ttc)} TTC</b>
          {totals.ratioTtc && <> · <b>{fmtMoney(totals.ratioTtc)} TTC/m²</b>{totals.honoraires > 0 ? ' MOE comprise' : ''}</>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btnS}>Annuler</button>
          <button onClick={submit} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  )
}
