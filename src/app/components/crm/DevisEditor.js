'use client'
import { useMemo } from 'react'
import { FF, inp, sel, btnP, btnS } from '../../dashboards/shared'
import {
  TVA_TAUX, UNITES, blankLigne, blankTitre, ligneTotal, computeDevisTotals,
  DEVIS_STATUT_COLORS,
} from '../../lib/devis'

export const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(Number(n) || 0)

const small = { ...inp, minHeight: 36, padding: '6px 8px', fontSize: 13 }
const smallSel = { ...sel, minHeight: 36, padding: '6px 4px', fontSize: 13 }
const miniBtn = {
  background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
  padding: '2px 6px', fontSize: 11, color: '#64748B', fontFamily: 'inherit', lineHeight: 1.4,
}

/**
 * Éditeur de devis (contenu de modale, contrôlé par le parent).
 *
 * form    : devis en cours d'édition (lignes avec valeurs string pour les inputs)
 * setForm : setter React (accepte une fonction)
 */
export default function DevisEditor({ form, setForm, m, error, saving, onCancel, onSave, onSend, onPreview }) {
  const totals = useMemo(() => computeDevisTotals(form.lignes || [], form), [form])
  const lignes = form.lignes || []
  const sent = form.statut && form.statut !== 'Brouillon'
  const defaultTva = [...lignes].reverse().find(l => l.type !== 'titre')?.tva_taux || '20'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLigne = (i, k, v) => setForm(f => ({ ...f, lignes: f.lignes.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }))
  const addLigne = () => setForm(f => ({ ...f, lignes: [...(f.lignes || []), blankLigne(defaultTva)] }))
  const addTitre = () => setForm(f => ({ ...f, lignes: [...(f.lignes || []), blankTitre()] }))
  const removeLigne = (i) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, j) => j !== i) }))
  const move = (i, d) => setForm(f => {
    const arr = [...f.lignes]; const j = i + d
    if (j < 0 || j >= arr.length) return f
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    return { ...f, lignes: arr }
  })

  const cols = m ? null : 'minmax(0,1fr) 84px 64px 100px 76px 96px 58px'

  return (
    <div>
      {sent && (
        <div role="status" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', color: '#5B21B6', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
          Ce devis est <strong style={{ color: DEVIS_STATUT_COLORS[form.statut] }}>{form.statut.toLowerCase()}</strong>.
          Pour une nouvelle proposition, préfère « Dupliquer » depuis la fiche affaire.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Objet du devis">
          <input style={inp} value={form.objet || ''} placeholder="Ex : Mission de maîtrise d'œuvre — rénovation maison"
            onChange={e => set('objet', e.target.value)} />
        </FF>
        <FF label="Date">
          <input style={inp} type="date" value={form.date_emission || ''} onChange={e => set('date_emission', e.target.value)} />
        </FF>
        <FF label="Valable jusqu'au">
          <input style={inp} type="date" value={form.date_validite || ''} onChange={e => set('date_validite', e.target.value)} />
        </FF>
      </div>

      {/* ─── Lignes ─── */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', margin: '4px 0 6px' }}>Détail</div>
      {!m && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 2px 4px' }}>
          <span>Désignation</span><span>Unité</span><span>Qté</span><span>PU HT</span><span>TVA</span><span style={{ textAlign: 'right' }}>Total HT</span><span />
        </div>
      )}
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
        {lignes.map((l, i) => {
          const tools = (
            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter la ligne ${i + 1}`} style={miniBtn}>↑</button>
              <button type="button" onClick={() => removeLigne(i)} aria-label={`Supprimer la ligne ${i + 1}`} style={{ ...miniBtn, color: '#DC2626' }}>×</button>
            </div>
          )
          if (l.type === 'titre') {
            return (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input style={{ ...small, fontWeight: 700, background: '#F1F5F9', flex: 1 }} value={l.designation || ''}
                  aria-label={`Titre de section ${i + 1}`} placeholder="Titre de section (ex : Phase conception)"
                  onChange={e => setLigne(i, 'designation', e.target.value)} />
                {tools}
              </div>
            )
          }
          const fields = {
            designation: (
              <textarea style={{ ...small, minHeight: 36, resize: 'vertical' }} rows={1} value={l.designation || ''}
                aria-label={`Désignation ligne ${i + 1}`} placeholder="Désignation"
                onChange={e => setLigne(i, 'designation', e.target.value)} />
            ),
            unite: (
              <select style={smallSel} value={l.unite || 'u'} aria-label={`Unité ligne ${i + 1}`} onChange={e => setLigne(i, 'unite', e.target.value)}>
                {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ),
            quantite: (
              <input style={small} inputMode="decimal" value={l.quantite ?? ''} aria-label={`Quantité ligne ${i + 1}`}
                onChange={e => setLigne(i, 'quantite', e.target.value)} />
            ),
            pu: (
              <input style={small} inputMode="decimal" value={l.prix_unitaire ?? ''} placeholder="0" aria-label={`Prix unitaire HT ligne ${i + 1}`}
                onChange={e => setLigne(i, 'prix_unitaire', e.target.value)} />
            ),
            tva: (
              <select style={smallSel} value={String(l.tva_taux ?? '20')} aria-label={`TVA ligne ${i + 1}`} onChange={e => setLigne(i, 'tva_taux', e.target.value)}>
                {TVA_TAUX.map(t => <option key={t} value={String(t)}>{String(t).replace('.', ',')} %</option>)}
              </select>
            ),
            total: <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtEur(ligneTotal(l))}</span>,
          }
          if (m) {
            return (
              <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
                {fields.designation}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {fields.quantite}{fields.unite}{fields.pu}{fields.tva}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{fields.total}{tools}</div>
              </div>
            )
          }
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'start' }}>
              {fields.designation}{fields.unite}{fields.quantite}{fields.pu}{fields.tva}
              <div style={{ paddingTop: 9, textAlign: 'right' }}>{fields.total}</div>
              {tools}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '8px 0 14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={addLigne} style={{ ...btnS, fontSize: 12, padding: '6px 12px', minHeight: 32 }}>+ Ligne</button>
        <button type="button" onClick={addTitre} style={{ ...btnS, fontSize: 12, padding: '6px 12px', minHeight: 32 }}>+ Titre de section</button>
      </div>

      {/* ─── Remise / acompte / totaux ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start', marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <FF label="Remise (%)">
            <input style={inp} inputMode="decimal" value={form.remise_pct ?? ''} placeholder="0"
              onChange={e => set('remise_pct', e.target.value)} />
          </FF>
          <FF label="Acompte (%)">
            <input style={inp} inputMode="decimal" value={form.acompte_pct ?? ''} placeholder="0"
              onChange={e => set('acompte_pct', e.target.value)} />
          </FF>
        </div>
        <div data-testid="devis-totaux" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#334155' }}>
          {totals.remise > 0 && (<>
            <Row l="Total HT brut" v={fmtEur(totals.htBrut)} />
            <Row l="Remise" v={`− ${fmtEur(totals.remise)}`} />
          </>)}
          <Row l="Total HT" v={fmtEur(totals.ht)} bold />
          {totals.tvaParTaux.map(x => <Row key={x.taux} l={`TVA ${String(x.taux).replace('.', ',')} %`} v={fmtEur(x.montant)} />)}
          <div style={{ borderTop: '1px solid #CBD5E1', margin: '6px 0' }} />
          <Row l="Total TTC" v={fmtEur(totals.ttc)} bold big />
          {totals.acompte > 0 && <Row l="Acompte à la commande" v={fmtEur(totals.acompte)} />}
        </div>
      </div>

      <FF label="Conditions (imprimées sur le devis)">
        <textarea style={{ ...inp, minHeight: 80, resize: 'vertical', fontSize: 13 }} value={form.conditions || ''}
          onChange={e => set('conditions', e.target.value)} />
      </FF>
      <FF label="Notes internes" hint="Non imprimées">
        <textarea style={{ ...inp, minHeight: 50, resize: 'vertical', fontSize: 13 }} value={form.notes || ''}
          onChange={e => set('notes', e.target.value)} />
      </FF>

      {error && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button onClick={onCancel} style={btnS}>Annuler</button>
        <button onClick={onPreview} disabled={saving} style={btnS} title="Télécharger le PDF sans enregistrer">Aperçu PDF</button>
        <button onClick={onSave} disabled={saving} style={{ ...(sent ? btnP : btnS), opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : sent ? 'Enregistrer' : 'Enregistrer le brouillon'}
        </button>
        {!sent && (
          <button onClick={onSend} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}
            title="Télécharge le PDF, ouvre ton mail et passe l'affaire en « Devis envoyé »">
            📤 Enregistrer et envoyer
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ l, v, bold, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', fontWeight: bold ? 700 : 400, fontSize: big ? 14 : 12, color: big ? '#1E3A5F' : undefined }}>
      <span>{l}</span><span style={{ whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  )
}
