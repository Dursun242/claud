'use client'
// Chiffrage estimatif (DPGF) d'un chantier, dans la fiche chantier (équipe) :
// résumé (travaux HT, total TTC MOE comprise, ratio TTC/m² sur SHAB + ½
// garage), comparaison estimé / engagé lot par lot avec les OS, contrôles de
// bon sens, relecture des prix par l'IA, exports PDF et Excel (charte ID
// Maîtrise). Création depuis les plans, une description, un import ou à la
// main (ChiffrageCreateModal) ; modification dans l'éditeur (ChiffrageEditor).
import { useMemo, useState } from 'react'
import { fmtMoney } from '../../dashboards/shared'
import { useChiffrage } from '../../hooks/useChiffrage'
import { chiffrageTotals, compareWithOs, sanityChecks, osPriceRefs } from '../../lib/chiffrage'
import { apiPost } from '../../lib/crmApi'
import { useToast } from '../../contexts/ToastContext'
import { useConfirm } from '../../contexts/ConfirmContext'
import ChiffrageEditor from './ChiffrageEditor'
import ChiffrageCreateModal from './ChiffrageCreateModal'

const btn = (color, bg, border) => ({
  background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: '6px 11px',
  cursor: 'pointer', fontSize: 11, fontWeight: 700, color, fontFamily: 'inherit',
})
const kpi = { background: '#F8FAFC', borderRadius: 8, padding: 10 }
const kpiLabel = { fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }

const VERIF_META = {
  oubli: ['Oubli', '#B91C1C'], prix_bas: ['Prix bas', '#B45309'], prix_haut: ['Prix haut', '#B45309'],
  quantite: ['Quantité', '#7C3AED'], incoherence: ['Incohérence', '#B91C1C'], info: ['Info', '#475569'],
}

const barColor = (pct) => pct == null ? '#94A3B8' : pct > 105 ? '#EF4444' : pct >= 90 ? '#F59E0B' : '#10B981'

export default function ChiffrageSection({ chantier, os = [], allOs = [], user, m, onApplyToChantier }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const { chiffrage, missingMigration, ready, save, remove } = useChiffrage(chantier.id)
  const [editing, setEditing] = useState(null) // brouillon ouvert dans l'éditeur
  const [creating, setCreating] = useState(false)
  const [showChecks, setShowChecks] = useState(false)
  const [verif, setVerif] = useState(null) // { synthese, remarques } | 'busy'

  const totals = useMemo(() => chiffrage && chiffrageTotals(chiffrage), [chiffrage])
  const cmp = useMemo(() => chiffrage && compareWithOs({ lots: chiffrage.lots, os, aleas_pct: chiffrage.aleas_pct }), [chiffrage, os])
  const checks = useMemo(() => chiffrage ? sanityChecks(chiffrage) : [], [chiffrage])
  const refs = useMemo(() => (editing ? osPriceRefs(allOs, 500) : []), [editing, allOs])

  const onSave = async (c) => {
    await save(c, user?.email)
    addToast('Chiffrage enregistré', 'success')
    setEditing(null)
  }

  const exportXlsx = async () => {
    try {
      const { downloadChiffrageXlsx } = await import('../../lib/chiffrageXlsx')
      await downloadChiffrageXlsx(chiffrage, chantier)
    } catch (e) {
      addToast(e?.message || 'Erreur Excel', 'error')
    }
  }
  const verifier = async () => {
    setVerif('busy')
    try {
      const { data } = await apiPost('/api/chiffrage/ia', {
        action: 'verifier', chantier: chantier.nom, description: chiffrage.description,
        lots: chiffrage.lots, surface_m2: chiffrage.surface_m2, surface_annexes: chiffrage.surface_annexes,
        aleas_pct: chiffrage.aleas_pct, tva_pct: chiffrage.tva_pct, refs: osPriceRefs(allOs),
      })
      setVerif(data)
    } catch (e) {
      setVerif(null)
      addToast(e?.message || 'Relecture impossible', 'error')
    }
  }
  const exportPdf = async () => {
    try {
      const { generateChiffragePdf } = await import('../../generators')
      await generateChiffragePdf(chiffrage, chantier)
    } catch (e) {
      addToast(e?.message || 'Erreur PDF', 'error')
    }
  }
  const onDelete = async () => {
    const ok = await confirm({ title: 'Supprimer le chiffrage ?', message: 'Le chiffrage estimatif de ce chantier sera effacé.', confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try { await remove(); addToast('Chiffrage supprimé', 'success') } catch (e) { addToast(e.message, 'error') }
  }
  const applyToChantier = async () => {
    const lots = chiffrage.lots.filter(l => !l.honoraires).map(l => l.nom).filter(Boolean)
    const ok = await confirm({
      title: 'Reporter sur le chantier ?',
      message: `Budget du chantier : ${fmtMoney(totals.travauxTtc)} TTC (travaux${chiffrage.aleas_pct ? ' avec aléas' : ''}, hors honoraires). Lots du chantier : ${lots.join(', ')}.`,
      confirmLabel: 'Reporter',
    })
    if (!ok) return
    try { await onApplyToChantier({ budget: Math.round(totals.travauxTtc), lots }); addToast('Budget et lots du chantier mis à jour', 'success') } catch (e) { addToast(e?.message || 'Erreur', 'error') }
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Chiffrage estimatif</h3>
      {chiffrage && <span style={{ background: '#0EA5E918', color: '#0284C7', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>{chiffrage.lots.length} lots</span>}
    </div>
  )

  if (!ready) return null
  if (missingMigration) {
    return <div style={{ marginBottom: 20 }}>{header}
      <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 10 }}>
        Module disponible après application de la migration 040 dans Supabase.
      </div></div>
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {header}
      {!chiffrage ? (
        <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
            Pas encore de chiffrage. Établis le DPGF du projet : il sera comparé lot par lot aux ordres de service.
          </div>
          <button onClick={() => setCreating(true)} style={btn('#fff', '#0284C7', '#0284C7')}>+ Créer le chiffrage</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: m ? 12 : 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
            <div style={kpi}><div style={kpiLabel}>Travaux HT</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{fmtMoney(totals.htAleas)}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>{chiffrage.aleas_pct ? `dont aléas ${chiffrage.aleas_pct} %` : `${fmtMoney(totals.travauxTtc)} TTC`}</div></div>
            <div style={kpi}><div style={kpiLabel}>Total TTC</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{fmtMoney(totals.ttc)}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>{totals.honoraires ? `MOE comprise (${fmtMoney(totals.honoraires)} HT)` : `TVA ${chiffrage.tva_pct} %`}</div></div>
            <div style={kpi}><div style={kpiLabel}>Ratio TTC/m²</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{totals.ratioTtc ? `${fmtMoney(totals.ratioTtc)}` : '—'}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>{totals.surfaceRef
                ? `${totals.honoraires ? 'MOE comprise · ' : ''}${String(totals.surfaceRef).replace('.', ',')} m²${Number(chiffrage.surface_annexes) ? ' (SHAB + ½ garage)' : ''}`
                : 'surface non renseignée'}</div></div>
            <div style={kpi}><div style={kpiLabel}>Engagé (OS HT)</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: barColor(cmp.totaux.pct) }}>{fmtMoney(cmp.totaux.engage)}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>{cmp.totaux.pct != null ? `${cmp.totaux.pct} % des travaux` : '—'}</div></div>
          </div>

          {/* Estimé / engagé par lot */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 460 }}>
              <thead><tr style={{ color: '#64748B', fontSize: 10, textTransform: 'uppercase', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Lot</th><th style={{ padding: '4px 6px' }}>Estimé HT</th>
                <th style={{ padding: '4px 6px' }}>Engagé (OS)</th><th style={{ padding: '4px 6px' }}>Écart</th><th style={{ padding: '4px 6px', width: 90 }} />
              </tr></thead>
              <tbody>
                {cmp.lignes.map(l => (
                  <tr key={l.nom} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '6px', fontWeight: 600, color: '#0F172A' }}>{l.nom}
                      {l.horsChiffrage && <span style={{ marginLeft: 6, fontSize: 10, color: '#B45309', fontWeight: 600 }}>hors chiffrage</span>}
                      {l.brouillon > 0 && <div style={{ fontSize: 10, color: '#64748B', fontWeight: 400 }}>+ {fmtMoney(l.brouillon)} en brouillon</div>}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{fmtMoney(l.estime)}</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{l.nbOs ? `${fmtMoney(l.engage)} · ${l.nbOs} OS` : '—'}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600, color: l.nbOs ? (l.ecart > 0 ? '#DC2626' : '#059669') : '#94A3B8' }}>
                      {l.nbOs ? `${l.ecart > 0 ? '+' : ''}${fmtMoney(l.ecart)}` : '—'}</td>
                    <td style={{ padding: '6px' }}>
                      {l.nbOs > 0 && l.pct != null && <div title={`${l.pct} %`} style={{ height: 6, background: '#F1F5F9', borderRadius: 3 }}>
                        <div style={{ width: `${Math.min(100, l.pct)}%`, height: 6, borderRadius: 3, background: barColor(l.pct) }} /></div>}
                    </td>
                  </tr>
                ))}
                {cmp.sansLot.nb > 0 && (
                  <tr style={{ borderTop: '1px solid #F1F5F9', color: '#B45309' }}>
                    <td style={{ padding: '6px', fontWeight: 600 }} colSpan={2}>OS sans lot ({cmp.sansLot.nb}) — à rattacher pour la comparaison</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{fmtMoney(cmp.sansLot.engage)}</td><td colSpan={2} />
                  </tr>
                )}
                <tr style={{ borderTop: '2px solid #E2E8F0', fontWeight: 700 }}>
                  <td style={{ padding: '6px' }}>Total travaux{chiffrage.aleas_pct ? ` (avec aléas : ${fmtMoney(cmp.totaux.budget)})` : ''}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{fmtMoney(cmp.totaux.estime)}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{fmtMoney(cmp.totaux.engage)}</td>
                  <td style={{ padding: '6px', textAlign: 'right', color: cmp.totaux.ecart > 0 ? '#DC2626' : '#059669' }}>
                    {cmp.totaux.engage ? `${cmp.totaux.ecart > 0 ? '+' : ''}${fmtMoney(cmp.totaux.ecart)}` : '—'}</td><td />
                </tr>
              </tbody>
            </table>
          </div>

          {checks.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', color: '#92400E' }}>
              <button onClick={() => setShowChecks(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#92400E', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
                ⚠ {checks.length} point{checks.length > 1 ? 's' : ''} à vérifier {showChecks ? '▴' : '▾'}
              </button>
              {showChecks && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{checks.map(c => <li key={c}>{c}</li>)}</ul>}
            </div>
          )}

          {verif && verif !== 'busy' && (
            <div style={{ marginTop: 10, fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <b style={{ color: '#0F172A' }}>Relecture des prix{verif.ia ? <span style={{ fontWeight: 400, color: '#64748B' }}> · {verif.ia === 'mistral' ? 'Mistral' : 'Claude'}</span> : null}</b>
                <button onClick={() => setVerif(null)} aria-label="Fermer la relecture" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontFamily: 'inherit' }}>✕</button>
              </div>
              {verif.synthese && <div style={{ color: '#334155', marginBottom: 8 }}>{verif.synthese}</div>}
              {verif.remarques.map((x, k) => {
                const [lib, color] = VERIF_META[x.type] || VERIF_META.info
                return (
                  <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0', borderTop: k ? '1px solid #E2E8F0' : 'none' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 70 }}>{lib}{x.poste ? ` · ${x.poste}` : ''}</span>
                    <span style={{ flex: 1, color: '#334155' }}>{x.message}</span>
                    {x.impact_ht !== 0 && <span style={{ fontWeight: 700, color: x.impact_ht > 0 ? '#B91C1C' : '#047857', whiteSpace: 'nowrap' }}>{x.impact_ht > 0 ? '+' : ''}{fmtMoney(x.impact_ht)}</span>}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={() => setEditing(chiffrage)} style={btn('#fff', '#0284C7', '#0284C7')}>Modifier le DPGF</button>
            <button onClick={verifier} disabled={verif === 'busy'} style={{ ...btn('#0F172A', '#fff', '#CBD5E1'), opacity: verif === 'busy' ? 0.6 : 1 }}>
              {verif === 'busy' ? 'Relecture en cours…' : 'Vérifier les prix (IA)'}</button>
            <button onClick={exportPdf} style={btn('#B91C1C', '#FEF2F2', '#FECACA')}>PDF</button>
            <button onClick={exportXlsx} style={btn('#047857', '#ECFDF5', '#A7F3D0')}>Excel</button>
            {onApplyToChantier && <button onClick={applyToChantier} style={btn('#475569', '#F1F5F9', '#E2E8F0')}>Reporter budget et lots</button>}
            <button onClick={() => setCreating(true)} style={btn('#475569', '#F1F5F9', '#E2E8F0')}>Refaire (IA / import)</button>
            <button onClick={onDelete} style={btn('#B91C1C', '#fff', '#FECACA')}>Supprimer</button>
          </div>
          {chiffrage.updated_at && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>
            Mis à jour le {new Date(chiffrage.updated_at).toLocaleDateString('fr-FR')}{chiffrage.updated_by ? ` par ${chiffrage.updated_by}` : ''}
          </div>}
        </div>
      )}

      <ChiffrageCreateModal
        open={creating}
        chantier={chantier}
        allOs={allOs}
        hasExisting={!!chiffrage}
        onClose={() => setCreating(false)}
        onResult={(draft) => { setCreating(false); setEditing({ ...(chiffrage || {}), ...draft }) }}
      />
      <ChiffrageEditor
        open={!!editing}
        initial={editing}
        chantier={chantier}
        refs={refs}
        onClose={() => setEditing(null)}
        onSave={onSave}
      />
    </div>
  )
}
