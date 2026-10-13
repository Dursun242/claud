'use client'
import { useState } from 'react'
import { apiPost } from '../../lib/crmApi'
import { useToast } from '../../contexts/ToastContext'
import { SUIVI, findSimilarRow } from '../../lib/crSuivi'
import { splitNotes, joinNotes } from '../../lib/crEditor'
import { card, field, label, ghostBtn, NAVY } from './crStyles'
import MicButton from './MicButton'

const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

/**
 * Dictée de la réunion + IA : les notes (dictées ou tapées) sont analysées,
 * l'IA propose observations, avancements, états des points, nouveaux points,
 * résumé, alertes et décisions. Rien n'est appliqué sans validation.
 * Les notes sont gardées avec le CR : à la reprise d'un brouillon, la
 * nouvelle dictée s'ajoute à la suite, et seules les notes ajoutées depuis
 * le dernier rangement sont analysées (rien n'est ajouté deux fois).
 */
export default function CRDictationPanel({ notes, notesRangees = 0, setNotes, setNotesRangees, dictation, context, date, rowsById, onApply }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState(null)
  const [keep, setKeep] = useState({})
  const [analysedLen, setAnalysedLen] = useState(0)
  const micId = 'notes'
  const { ranges, nouvelles } = splitNotes(notes, notesRangees)

  const analyse = async () => {
    if (busy) return
    if (dictation?.target === micId) dictation.stop()
    setBusy(true)
    // Partie analysée : tout jusqu'ici (la dictée peut continuer pendant l'analyse)
    const upTo = String(notes || '').trimEnd().length
    try {
      const res = await apiPost('/api/cr/ia', { notes: nouvelles, context, date })
      const d = res.data
      const k = {}
      if (d.resume) k.resume = true
      if (d.alertes) k.alertes = true
      if (d.decisions) k.decisions = true
      d.lots.forEach((_, i) => { k[`lot${i}`] = true })
      d.points_existants.forEach((_, i) => { k[`pe${i}`] = true })
      d.nouveaux_points.forEach((_, i) => { k[`np${i}`] = true })
      if (!Object.keys(k).length) { addToast('L’IA n’a rien trouvé à reporter dans ces notes.', 'info'); return }
      setProposal(d)
      setKeep(k)
      setAnalysedLen(upTo)
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
      alertes: keep.alertes ? d.alertes : '',
      decisions: keep.decisions ? d.decisions : '',
      lots: d.lots.filter((_, i) => keep[`lot${i}`]),
      points_existants: d.points_existants.filter((_, i) => keep[`pe${i}`]),
      nouveaux_points: d.nouveaux_points.filter((_, i) => keep[`np${i}`]),
    })
    setNotesRangees?.(analysedLen)
    const n = Object.values(keep).filter(Boolean).length
    addToast(`${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au compte rendu — vérifie les lots avant d’enregistrer.`, 'success')
    setProposal(null)
  }

  const item = (id, children) => (
    <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, background: keep[id] ? 'var(--row-fill)' : '#fff', border: '1px solid var(--separator)', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!keep[id]} onChange={e => setKeep(k => ({ ...k, [id]: e.target.checked }))}
        style={{ width: 18, height: 18, marginTop: 2, accentColor: NAVY, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--label)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{children}</span>
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
      <p style={{ fontSize: 12, color: 'var(--label-secondary)', margin: '0 0 8px' }}>
        Dicte ou tape tout ce qui se dit, lot par lot. L&apos;IA range ensuite les observations, l&apos;avancement, les points faits ou à relancer et les nouvelles actions — tu valides avant que ce soit ajouté.
      </p>
      {ranges && (
        <details style={{ marginBottom: 8, background: 'var(--row-fill)', border: '1px solid var(--separator)', borderRadius: 8, padding: '6px 10px' }}>
          <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--label-2)', cursor: 'pointer' }}>
            Notes déjà rangées dans le compte rendu ({ranges.trim().split(/\s+/).length} mots)
          </summary>
          <div style={{ fontSize: 12, color: 'var(--label-secondary)', whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>{ranges}</div>
        </details>
      )}
      <textarea aria-label={ranges ? 'Nouvelles notes de réunion' : 'Notes de réunion'} value={nouvelles} onChange={e => setNotes(joinNotes(ranges, e.target.value))} rows={6}
        placeholder="Ex : Électricité, Martin absent, le tableau n'est toujours pas posé, à relancer. Plomberie : réseaux sous dallage terminés, avancement 60 %. Carreleur doit fournir les échantillons pour vendredi…"
        style={{ ...field, resize: 'vertical' }} />
      {dictation?.target === micId && dictation.interim && (
        <div style={{ fontSize: 12, color: 'var(--label-secondary)', fontStyle: 'italic', marginTop: 3 }}>{dictation.interim}…</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={analyse} disabled={busy || nouvelles.trim().length < 10}
          style={{ ...ghostBtn('#fff'), background: NAVY, border: 'none', color: '#fff', opacity: busy || nouvelles.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? 'Analyse en cours…' : ranges ? 'Ranger les nouvelles notes avec l’IA' : 'Ranger avec l’IA'}
        </button>
        {nouvelles && <button type="button" onClick={() => setNotes(ranges)} style={ghostBtn('#6E6E73')}>{ranges ? 'Effacer les nouvelles notes' : 'Effacer les notes'}</button>}
      </div>

      {proposal && (
        <div role="region" aria-label="Proposition de l'IA" style={{ marginTop: 14, borderTop: '1px solid var(--separator)', paddingTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Proposition de l&apos;IA — décoche ce que tu ne veux pas garder</div>
          {group('Résumé', proposal.resume ? [item("resume", <>{proposal.resume}</>)] : [])}
          {group('Par lot', proposal.lots.map((l, i) => (
            item(`lot${i}`, <><b>{l.lot}</b>{l.avancement != null ? ` · avancement ${l.avancement} %` : ''}{l.observations ? ` — ${l.observations}` : ''}</>)
          )))}
          {group('Points existants', proposal.points_existants.map((p, i) => {
            const r = rowsById.get(p.id)
            return (
              item(`pe${i}`, <>
                {r?.num ? `n°${r.num} ` : ''}{r?.titre || 'Point'}
                {p.etat !== 'inchange' && SUIVI[p.etat] ? <> → <b>{SUIVI[p.etat]}</b></> : null}
                {p.complement ? <> · complété : « {p.complement} »</> : null}
                {p.echeance ? `, échéance reportée au ${fmt(p.echeance)}` : ''}
              </>)
            )
          }))}
          {group('Nouveaux points', proposal.nouveaux_points.map((p, i) => {
            // Point semblable déjà présent : il sera complété, pas recréé
            const same = findSimilarRow([...rowsById.values()], p)
            return item(`np${i}`, <>
              <b>{p.titre}</b> — {p.lot}{p.entreprise ? ` · ${p.entreprise}` : ''}{p.echeance ? ` · pour le ${fmt(p.echeance)}` : ''}{p.priorite === 'Urgent' ? ' · URGENT' : ''}
              {same && <span style={{ display: 'block', fontSize: 12, color: 'var(--accent-text)' }}>Complète le point {same.num ? `n°${same.num} ` : ''}« {same.titre} » (pas de doublon)</span>}
            </>)
          }))}
          {group('Alertes (retards, non-conformités, risques)', proposal.alertes ? [item('alertes', <>{proposal.alertes}</>)] : [])}
          {group('Décisions', proposal.decisions ? [item("decisions", <>{proposal.decisions}</>)] : [])}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setProposal(null)} style={ghostBtn('#6E6E73')}>Annuler</button>
            <button type="button" onClick={apply} style={{ ...ghostBtn('#fff'), background: 'var(--green-text)', border: 'none', color: '#fff' }}>
              Ajouter au compte rendu
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
