'use client'
import { useState } from 'react'
import { apiPost } from '../../lib/crmApi'
import { useToast } from '../../contexts/ToastContext'
import { SUIVI } from '../../lib/crSuivi'
import { card, field, label, ghostBtn, NAVY } from './crStyles'
import MicButton from './MicButton'

const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/**
 * Dictée de la réunion + IA : les notes (dictées ou tapées) sont analysées,
 * l'IA propose observations, avancements, états des points, nouveaux points,
 * résumé et décisions. Rien n'est appliqué sans validation.
 */
export default function CRDictationPanel({ notes, setNotes, dictation, context, date, rowsById, onApply }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [keep, setKeep] = useState({})
  const micId = 'notes'

  const analyse = async () => {
    if (busy) return
    if (dictation?.target === micId) dictation.stop()
    setBusy(true)
    try {
      const res = await apiPost('/api/cr/ia', { notes, context, date })
      const d = res.data
      const k = {}
      if (d.resume) k.resume = true
      if (d.decisions) k.decisions = true
      d.lots.forEach((_, i) => { k[`lot${i}`] = true })
      d.points_existants.forEach((_, i) => { k[`pe${i}`] = true })
      d.nouveaux_points.forEach((_, i) => { k[`np${i}`] = true })
      if (!Object.keys(k).length) { addToast('L’IA n’a rien trouvé à reporter dans ces notes.', 'info'); return }
      setProposal(d)
      setKeep(k)
    } catch (e) {
      addToast(e?.message || 'Analyse impossible', 'error')
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    const d = proposal
    onApply({
      resume: keep.resume ? d.resume : '',
      decisions: keep.decisions ? d.decisions : '',
      lots: d.lots.filter((_, i) => keep[`lot${i}`]),
      points_existants: d.points_existants.filter((_, i) => keep[`pe${i}`]),
      nouveaux_points: d.nouveaux_points.filter((_, i) => keep[`np${i}`]),
    })
    const n = Object.values(keep).filter(Boolean).length
    addToast(`${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au compte rendu — vérifie les lots avant d’enregistrer.`, 'success')
    setProposal(null)
  }

  const item = (id, children) => (
    <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, background: keep[id] ? '#F8FAFC' : '#fff', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!keep[id]} onChange={e => setKeep(k => ({ ...k, [id]: e.target.checked }))}
        style={{ width: 18, height: 18, marginTop: 2, accentColor: NAVY, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: '#0F172A', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{children}</span>
    </label>
  )
  const group = (title, items) => items.length > 0 && (
    <div style={{ marginBottom: 10 }}>
      <span style={label}>{title}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{items}</div>
    </div>
  )

  return (
    <section id="cr-section-dictee" aria-label="Dictée de la réunion" style={{ ...card, scrollMarginTop: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>Dictée de la réunion</h3>
        {dictation && (
          <MicButton active={dictation.target === micId} label="Dicter la réunion"
            onClick={() => dictation.toggle(micId, (t) => setNotes(n => (n ? `${n.trimEnd()} ${t}` : t)))} />
        )}
      </div>
      <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 8px' }}>
        Dicte ou tape tout ce qui se dit, lot par lot. L&apos;IA range ensuite les observations, l&apos;avancement, les points faits ou à relancer et les nouvelles actions — tu valides avant que ce soit ajouté.
      </p>
      <textarea aria-label="Notes de réunion" value={notes} onChange={e => setNotes(e.target.value)} rows={6}
        placeholder="Ex : Électricité, Martin absent, le tableau n'est toujours pas posé, à relancer. Plomberie : réseaux sous dallage terminés, avancement 60 %. Carreleur doit fournir les échantillons pour vendredi…"
        style={{ ...field, resize: 'vertical' }} />
      {dictation?.target === micId && dictation.interim && (
        <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', marginTop: 3 }}>{dictation.interim}…</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={analyse} disabled={busy || notes.trim().length < 10}
          style={{ ...ghostBtn('#fff'), background: NAVY, border: 'none', color: '#fff', opacity: busy || notes.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? 'Analyse en cours…' : '✨ Ranger avec l’IA'}
        </button>
        {notes && <button type="button" onClick={() => setNotes('')} style={ghostBtn('#64748B')}>Effacer les notes</button>}
      </div>

      {proposal && (
        <div role="region" aria-label="Proposition de l'IA" style={{ marginTop: 14, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Proposition de l&apos;IA — décoche ce que tu ne veux pas garder</div>
          {group('Résumé', proposal.resume ? [item("resume", <>{proposal.resume}</>)] : [])}
          {group('Par lot', proposal.lots.map((l, i) => (
            item(`lot${i}`, <><b>{l.lot}</b>{l.avancement != null ? ` · avancement ${l.avancement} %` : ''}{l.observations ? ` — ${l.observations}` : ''}</>)
          )))}
          {group('Points existants', proposal.points_existants.map((p, i) => {
            const r = rowsById.get(p.id)
            return (
              item(`pe${i}`, <>
                {r?.num ? `n°${r.num} ` : ''}{r?.titre || 'Point'} → <b>{SUIVI[p.etat]}</b>{p.echeance ? `, échéance reportée au ${fmt(p.echeance)}` : ''}
              </>)
            )
          }))}
          {group('Nouveaux points', proposal.nouveaux_points.map((p, i) => (
            item(`np${i}`, <>
              <b>{p.titre}</b> — {p.lot}{p.entreprise ? ` · ${p.entreprise}` : ''}{p.echeance ? ` · pour le ${fmt(p.echeance)}` : ''}{p.priorite === 'Urgent' ? ' · URGENT' : ''}
            </>)
          )))}
          {group('Décisions', proposal.decisions ? [item("decisions", <>{proposal.decisions}</>)] : [])}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setProposal(null)} style={ghostBtn('#64748B')}>Annuler</button>
            <button type="button" onClick={apply} style={{ ...ghostBtn('#fff'), background: '#047857', border: 'none', color: '#fff' }}>
              Ajouter au compte rendu
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
