'use client'
import { useMemo, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { useCrEditor } from '../../hooks/useCrEditor'
import { useDictation } from '../../hooks/useDictation'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import {
  chantierIntervenants, entrepriseOf, lotKey, crTaskStats, aiContext, globalProgress,
} from '../../lib/crSuivi'
import { pointsBySection } from '../../lib/crEditor'
import { loadCrImages } from '../../lib/crPhotos'
import { card, field, label, ghostBtn, NAVY } from './crStyles'
import CRIntervenantsPicker from './CRIntervenantsPicker'
import CRLotSection from './CRLotSection'
import CRDictationPanel from './CRDictationPanel'
import MicButton from './MicButton'

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const ENTREPRISES_LIST = 'cr-entreprises'

/**
 * Éditeur plein écran d'un compte rendu de chantier.
 * - Mode « Réunion » (sur chantier, téléphone / tablette) : une étape à la
 *   fois — présences, dictée, Généralités, chaque lot, synthèse.
 * - Mode « Rédaction » (bureau) : tout sur une page, sommaire à gauche.
 * Le brouillon est gardé sur l'appareil pendant la saisie (hors ligne
 * compris). `onSaved(cr, { send })` après enregistrement.
 */
export default function CREditor({ open, initial, data, onClose, onSaved, lockChantier = false, m }) {
  const { addToast } = useToast()
  const ed = useCrEditor({ open, initial, data })
  const dictation = useDictation({ onError: (msg) => addToast(msg, 'warning') })
  useLeaveGuard(open)
  // Mode choisi par l'utilisateur ; sinon selon l'écran (téléphone → Réunion)
  const [modeChoice, setMode] = useState(null)
  const mode = modeChoice || (m ? 'reunion' : 'redaction')
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')
  const [newLot, setNewLot] = useState('')

  const st = ed.state
  const form = st?.form || {}
  const rows = useMemo(() => st?.rows || [], [st?.rows])
  const sections = useMemo(() => st?.sections || [], [st?.sections])
  const next = form.prochaine_reunion || {}
  const chantier = (data.chantiers || []).find(c => c.id === form.chantierId) || null

  const available = useMemo(() => chantierIntervenants(data, form.chantierId), [data, form.chantierId])
  const entreprises = useMemo(() => [...new Set([
    ...available.map(entrepriseOf), ...(form.intervenants || []).map(entrepriseOf),
    ...sections.map(s => s.entreprise), ...rows.map(r => r.entreprise),
  ].map(e => String(e || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [available, form.intervenants, sections, rows])
  const counts = useMemo(() => pointsBySection(rows, sections), [rows, sections])
  const lots = useMemo(() => sections.map(s => ({ key: s.key, lot: s.lot })), [sections])
  const rowsById = useMemo(() => new Map(rows.filter(r => r.id).map(r => [r.id, r])), [rows])
  const stats = crTaskStats(rows)
  const progress = globalProgress(sections)

  const steps = useMemo(() => [
    { id: 'presences', label: 'Présences', anchor: 'presences' },
    { id: 'dictee', label: 'Dictée + IA', anchor: 'dictee' },
    ...sections.map(s => ({ id: `lot:${s.key}`, label: s.lot, anchor: s.key, section: s })),
    { id: 'cloture', label: 'Synthèse et convocation', anchor: 'cloture' },
  ], [sections])
  const current = steps[Math.min(step, steps.length - 1)]

  if (!open || !st) return null

  const goTo = (i) => {
    if (mode === 'reunion') { setStep(i); window.scrollTo?.({ top: 0 }) }
    else document.getElementById(`cr-section-${steps[i].anchor}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const validate = () => {
    if (!form.chantierId) return 'Sélectionne un chantier.'
    if (!form.date) return 'La date de la réunion est requise.'
    if (next.date && next.date <= form.date) return 'La prochaine réunion doit être après la date du CR.'
    return ''
  }

  const submit = async (send) => {
    if (saving) return
    const err = validate()
    setError(err)
    if (err) return
    dictation.stop()
    setSaving(true)
    try {
      const res = await ed.save({ statut: form.statut === 'Diffusé' ? 'Diffusé' : 'Brouillon' })
      if (res.migrationMissing) addToast('CR enregistré, mais le suivi des points, les lots et la convocation demandent la migration 033 (Supabase).', 'warning')
      if (res.failures.length) addToast(`Points non enregistrés : ${res.failures.join(' ; ')}`, 'error')
      if (res.photoFailures.length) addToast(`${res.photoFailures.length} photo(s) non envoyée(s) — elles restent sur l’appareil : ${res.photoFailures[0]}`, 'error')
      const s = crTaskStats(res.snapshot)
      const detail = [s.nouveau && `${s.nouveau} nouveau${s.nouveau > 1 ? 'x' : ''}`, s.fait && `${s.fait} soldé${s.fait > 1 ? 's' : ''}`,
        s.relance && `${s.relance} relancé${s.relance > 1 ? 's' : ''}`].filter(Boolean).join(', ')
      addToast(`CR n°${res.cr.numero} ${ed.isEdit ? 'mis à jour' : 'enregistré'}${detail ? ` — points : ${detail}` : ''}`, 'success')
      onSaved?.(res.cr, { send })
    } catch (e) {
      setError(e?.message || "Erreur lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  const preview = async () => {
    if (previewing) return
    setPreviewing(true)
    try {
      const { cr, images } = ed.preview()
      const saved = await loadCrImages(cr)
      const { generateCRPdf } = await import('../../generators')
      await generateCRPdf(cr, chantier, { images: { ...saved, ...images }, preview: true })
    } catch (e) {
      addToast('Aperçu impossible : ' + (e?.message || e), 'error')
    } finally {
      setPreviewing(false)
    }
  }

  const close = () => {
    dictation.stop()
    if (ed.localSavedAt) addToast('Brouillon gardé sur cet appareil : il te sera proposé à la réouverture.', 'info')
    onClose()
  }

  const renderStep = (s) => {
    if (s.id === 'presences') {
      return (
        <section key="presences" id="cr-section-presences" aria-label="Présences" style={{ ...card, scrollMarginTop: 120 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 17 }}>Présences et convocations</h3>
          <CRIntervenantsPicker m={m} available={available} value={form.intervenants || []}
            onChange={(v) => ed.setForm({ intervenants: v })} />
          <div style={{ marginTop: 10 }}>
            <span style={label}>Également présents (texte libre)</span>
            <input value={form.participants || ''} onChange={e => ed.setForm({ participants: e.target.value })}
              aria-label="Également présents" placeholder="Ex : bureau de contrôle, 2 riverains" style={field} />
          </div>
        </section>
      )
    }
    if (s.id === 'dictee') {
      return (
        <CRDictationPanel key="dictee" notes={st.notes} setNotes={ed.setNotes} dictation={dictation}
          context={aiContext({ sections, rows })} date={form.date} rowsById={rowsById} onApply={ed.applyAi} />
      )
    }
    if (s.section) {
      const sec = s.section
      return (
        <CRLotSection key={sec.key} section={sec} rows={rows.filter(r => lotKey(r.lot) === sec.key)}
          crId={initial?.id || null} crDate={form.date} lots={lots} entreprisesListId={ENTREPRISES_LIST}
          dictation={dictation} m={m}
          onSection={(p) => ed.updateSection(sec.key, p)} onRow={ed.updateRow} onRemoveRow={ed.removeRow}
          onAddRow={() => ed.addRow(sec.lot)} />
      )
    }
    return (
      <section key="cloture" id="cr-section-cloture" aria-label="Synthèse et convocation" style={{ ...card, scrollMarginTop: 120 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17 }}>Synthèse et convocation</h3>
        {[['resume', 'Synthèse de la réunion', 'Points marquants, état général du chantier…'], ['decisions', 'Décisions', 'Décisions prises pendant la réunion…']].map(([k, title, ph]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={label}>{title}</span>
              <MicButton active={dictation.target === k}
                onClick={() => dictation.toggle(k, (t) => ed.setForm({ [k]: form[k] ? `${String(form[k]).trimEnd()} ${t}` : t }))} />
            </div>
            <textarea aria-label={title} value={form[k] || ''} onChange={e => ed.setForm({ [k]: e.target.value })}
              rows={4} placeholder={ph} style={{ ...field, resize: 'vertical' }} />
            {dictation.target === k && dictation.interim && <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>{dictation.interim}…</div>}
          </div>
        ))}
        <span style={{ ...label, color: NAVY, marginTop: 6 }}>Prochaine réunion — convocation</span>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : '1fr 0.7fr 2fr', gap: 10 }}>
          <div>
            <span style={label}>Date</span>
            <input type="date" aria-label="Date de la prochaine réunion" value={next.date || ''} style={field}
              onChange={e => ed.setForm({ prochaine_reunion: { ...next, date: e.target.value } })} />
          </div>
          <div>
            <span style={label}>Heure</span>
            <input type="time" aria-label="Heure de la prochaine réunion" value={next.heure || ''} style={field}
              onChange={e => ed.setForm({ prochaine_reunion: { ...next, heure: e.target.value } })} />
          </div>
          <div style={{ gridColumn: m ? '1 / -1' : 'auto' }}>
            <span style={label}>Lieu</span>
            <input aria-label="Lieu de la prochaine réunion" value={next.lieu || ''} placeholder="Sur le chantier" style={field}
              onChange={e => ed.setForm({ prochaine_reunion: { ...next, lieu: e.target.value } })} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '6px 0 0' }}>
          Imprimée en page de garde, ajoutée à l&apos;agenda et envoyée aux intervenants convoqués. Laisse la date vide s&apos;il n&apos;y a pas de réunion suivante.
        </p>
      </section>
    )
  }

  const addLotForm = (
    <form onSubmit={(e) => { e.preventDefault(); ed.addSection(newLot); setNewLot('') }}
      style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input value={newLot} onChange={e => setNewLot(e.target.value)} placeholder="Ajouter un lot…" aria-label="Nom du lot à ajouter"
        style={{ ...field, minHeight: 36, fontSize: 13 }} />
      <button type="submit" disabled={!newLot.trim()} style={{ ...ghostBtn(), padding: '6px 10px' }}>+</button>
    </form>
  )

  const statusBadge = form.statut === 'Diffusé'
    ? { text: 'Diffusé', color: '#047857', bg: '#ECFDF5' }
    : { text: 'Brouillon', color: '#92400E', bg: '#FEF3C7' }

  return (
    <div role="dialog" aria-modal="true" aria-label={ed.isEdit ? `Compte rendu n°${form.numero}` : 'Nouveau compte rendu'}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#F1F5F9', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <datalist id={ENTREPRISES_LIST}>{entreprises.map(e => <option key={e} value={e} />)}</datalist>

      {/* En-tête */}
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #E2E8F0', padding: m ? '8px 12px' : '10px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={close} aria-label="Fermer" disabled={saving}
            style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 38, height: 38, cursor: 'pointer', fontSize: 16 }}>✕</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: m ? 15 : 17, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              CR n°{form.numero || '—'} · {chantier?.nom || 'Choisis un chantier'}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: statusBadge.color, background: statusBadge.bg, borderRadius: 4, padding: '0 6px' }}>{statusBadge.text}</span>
              {stats.total > 0 && <span>{stats.total} points · {stats.relance} à relancer · {stats.fait} faits</span>}
              {progress != null && <span>avancement global {progress} %</span>}
              {ed.localSavedAt && <span title="Brouillon enregistré sur cet appareil (utilisable hors ligne)">✓ sur l&apos;appareil à {fmtTime(ed.localSavedAt)}</span>}
            </div>
          </div>
          <div role="radiogroup" aria-label="Mode de saisie" style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
            {[['reunion', 'Réunion'], ['redaction', 'Rédaction']].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                style={{ border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: mode === k ? '#fff' : 'transparent', color: mode === k ? NAVY : '#64748B', boxShadow: mode === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: m ? '100%' : 'auto' }}>
            <button type="button" onClick={preview} disabled={previewing || !form.chantierId} style={{ ...ghostBtn(), flex: m ? 1 : 'none' }}>
              {previewing ? 'PDF…' : 'Aperçu PDF'}
            </button>
            <button type="button" onClick={() => submit(false)} disabled={saving} style={{ ...ghostBtn(), flex: m ? 1 : 'none' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={() => submit(true)} disabled={saving}
              style={{ ...ghostBtn('#fff'), background: NAVY, border: 'none', color: '#fff', flex: m ? 1 : 'none' }}>
              Diffuser
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#B91C1C' }}>⚠ {error}</div>
        )}
      </header>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: m ? 12 : 20 }}>
        {ed.draft && (
          <div role="status" style={{ ...card, background: '#FFFBEB', borderColor: '#FDE68A', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontSize: 13, color: '#92400E' }}>
              Un brouillon non enregistré de ce compte rendu existe sur cet appareil ({new Date(ed.draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}).
            </span>
            <button type="button" onClick={ed.restoreDraft} style={{ ...ghostBtn('#fff'), background: '#B45309', border: 'none', color: '#fff' }}>Reprendre</button>
            <button type="button" onClick={ed.discardDraft} style={ghostBtn('#92400E')}>Ignorer</button>
          </div>
        )}

        {/* Réunion : date, numéro, chantier */}
        <div style={{ ...card, marginBottom: 12, display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : (lockChantier || ed.isEdit ? '1fr 1fr 2fr' : '2fr 1fr 1fr'), gap: 10 }}>
          {!lockChantier && !ed.isEdit && (
            <div style={{ gridColumn: m ? '1 / -1' : 'auto' }}>
              <span style={label}>Chantier *</span>
              <select aria-label="Chantier" value={form.chantierId || ''} onChange={e => ed.changeChantier(e.target.value)} style={field}>
                <option value="">— Sélectionner —</option>
                {(data.chantiers || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <span style={label}>Date de la réunion *</span>
            <input type="date" aria-label="Date de la réunion" value={form.date || ''} onChange={e => ed.changeDate(e.target.value)} style={field} />
          </div>
          <div>
            <span style={label}>N°</span>
            <input type="number" min="1" aria-label="Numéro du CR" value={form.numero || ''} onChange={e => ed.setForm({ numero: e.target.value })} style={field} />
          </div>
          {(lockChantier || ed.isEdit) && !m && (
            <div style={{ fontSize: 12, color: '#64748B', alignSelf: 'end', paddingBottom: 10 }}>
              {st.previous ? `Fait suite au CR n°${st.previous.numero} du ${fmtDate(st.previous.date)}` : 'Premier compte rendu du chantier'}
            </div>
          )}
          {!lockChantier && !ed.isEdit && st.previous && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748B' }}>
              Fait suite au CR n°{st.previous.numero} du {fmtDate(st.previous.date)} — points ouverts, lots et convoqués repris.
            </div>
          )}
        </div>

        {!form.chantierId ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748B', fontSize: 14 }}>Choisis le chantier pour commencer.</div>
        ) : mode === 'redaction' ? (
          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '220px 1fr', gap: 16, alignItems: 'start' }}>
            {!m && (
              <nav aria-label="Sommaire du compte rendu" style={{ position: 'sticky', top: 90, ...card, padding: 10 }}>
                {steps.map((s, i) => {
                  const c = s.section ? counts[s.section.key] : null
                  return (
                    <button key={s.id} type="button" onClick={() => goTo(i)}
                      style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 6, border: 'none', background: 'none', padding: '7px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#0F172A', textAlign: 'left' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                      {c?.total ? <span style={{ fontSize: 11, fontWeight: 700, color: c.relance ? '#B91C1C' : '#64748B' }}>{c.total}</span> : null}
                    </button>
                  )
                })}
                {addLotForm}
              </nav>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {steps.map(renderStep)}
              {m && <div style={card}>{addLotForm}</div>}
            </div>
          </div>
        ) : (
          <div>
            <div role="tablist" aria-label="Étapes de la réunion" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
              {steps.map((s, i) => {
                const c = s.section ? counts[s.section.key] : null
                const on = s.id === current.id
                return (
                  <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => goTo(i)}
                    style={{ flexShrink: 0, borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      border: on ? `1.5px solid ${NAVY}` : '1px solid #CBD5E1', background: on ? NAVY : '#fff', color: on ? '#fff' : '#334155' }}>
                    {s.label}{c?.relance ? ` · ${c.relance}🔔` : c?.total ? ` · ${c.total}` : ''}
                  </button>
                )
              })}
            </div>
            {renderStep(current)}
            {current.id === 'cloture' && <div style={{ ...card, marginTop: 12 }}>{addLotForm}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, position: 'sticky', bottom: 0, background: '#F1F5F9', padding: '10px 0' }}>
              <button type="button" disabled={step === 0} onClick={() => goTo(step - 1)}
                style={{ ...ghostBtn(), flex: 1, minHeight: 48, opacity: step === 0 ? 0.5 : 1 }}>← Précédent</button>
              {step < steps.length - 1 ? (
                <button type="button" onClick={() => goTo(step + 1)}
                  style={{ ...ghostBtn('#fff'), flex: 2, minHeight: 48, background: NAVY, border: 'none', color: '#fff' }}>
                  {steps[step + 1].label} →
                </button>
              ) : (
                <button type="button" onClick={() => submit(true)} disabled={saving}
                  style={{ ...ghostBtn('#fff'), flex: 2, minHeight: 48, background: '#047857', border: 'none', color: '#fff' }}>
                  Enregistrer et diffuser
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
