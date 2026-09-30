'use client'
import { useEffect, useMemo, useState } from 'react'
import { FF, inp, sel, btnP, btnS, fmtDate } from '../../dashboards/shared'
import { Modal } from '../index'
import { useToast } from '../../contexts/ToastContext'
import { localISO } from '../../lib/today'
import {
  nextCrNumero, previousCr, initialRows, chantierIntervenants, carryIntervenants,
  defaultNextMeeting, defaultCrDate, entrepriseOf, crTaskStats,
} from '../../lib/crSuivi'
import { saveCr } from '../../lib/crDb'
import CRIntervenantsPicker from './CRIntervenantsPicker'
import CRActionsEditor from './CRActionsEditor'

const sectionTitle = {
  fontSize: 12, fontWeight: 800, color: '#1E3A5F', textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 8,
}

/** État initial du formulaire pour un chantier (nouveau CR) ou un CR existant. */
function buildState({ data, initial, chantierId }) {
  const crs = data.compteRendus || []
  const chantier = (data.chantiers || []).find(c => c.id === chantierId) || null
  if (initial?.id) {
    const previous = previousCr(crs, chantierId, { numero: initial.numero, excludeId: initial.id })
    return {
      form: { ...initial, chantierId, prochaine_reunion: initial.prochaine_reunion || { date: '', heure: '', lieu: '' } },
      rows: initialRows({ tasks: data.tasks || [], chantierId, crDate: initial.date, cr: initial }),
      previous,
    }
  }
  const previous = previousCr(crs, chantierId)
  const date = defaultCrDate(previous, localISO())
  return {
    form: {
      chantierId: chantierId || '', date, numero: chantierId ? nextCrNumero(crs, chantierId) : 1,
      resume: '', participants: '', decisions: '',
      intervenants: carryIntervenants(previous),
      prochaine_reunion: defaultNextMeeting({ crDate: date, previous, chantier }),
    },
    rows: chantierId ? initialRows({ tasks: data.tasks || [], chantierId, crDate: date, previous }) : [],
    previous,
  }
}

/**
 * Fenêtre de saisie d'un compte rendu de chantier (onglet CR et fiche
 * chantier) : numéro qui suit le CR précédent, intervenants (présence +
 * convocation), résumé, actions reprises / nouvelles, décisions, prochaine
 * réunion. `onSaved(cr, { send })` après enregistrement.
 */
export default function CRFormModal({ open, initial, data, onClose, onSaved, lockChantier = false, m }) {
  const { addToast } = useToast()
  const [state, setState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setState(null); return }
    const chId = initial?.chantierId || initial?.chantier_id || ''
    setState(buildState({ data, initial, chantierId: chId }))
    setError('')
  // Initialisation à l'ouverture uniquement (les rechargements de données
  // pendant la saisie ne doivent pas effacer ce qui est tapé).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const form = state?.form || {}
  const rows = state?.rows || []
  const isEdit = !!initial?.id
  const setForm = (p) => setState(s => ({ ...s, form: { ...s.form, ...p } }))
  const setRows = (r) => setState(s => ({ ...s, rows: r }))
  const next = form.prochaine_reunion || {}
  const setNext = (p) => setForm({ prochaine_reunion: { ...next, ...p } })

  const available = useMemo(() => chantierIntervenants(data, form.chantierId), [data, form.chantierId])
  const entreprises = useMemo(() => [...new Set([
    ...available.map(entrepriseOf), ...(form.intervenants || []).map(entrepriseOf),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [available, form.intervenants])

  const changeChantier = (chId) => setState(buildState({ data, initial: null, chantierId: chId }))
  const changeDate = (date) => {
    if (isEdit) { setForm({ date }); return }
    // Nouveau CR : les retards et la date de la réunion suivante suivent la date
    setState(s => ({
      ...s,
      form: { ...s.form, date, prochaine_reunion: { ...s.form.prochaine_reunion, date: defaultNextMeeting({ crDate: date, previous: s.previous }).date } },
      rows: [
        // Saisies conservées ; l'état proposé (retard → à relancer) suit la
        // nouvelle date tant qu'on ne l'a pas choisi à la main
        ...initialRows({ tasks: data.tasks || [], chantierId: s.form.chantierId, crDate: date, previous: s.previous })
          .map(r => {
            const cur = s.rows.find(x => x.key === r.key)
            if (!cur) return r
            return cur.suivi !== cur.initialSuivi ? cur : { ...cur, suivi: r.suivi, initialSuivi: r.initialSuivi }
          }),
        ...s.rows.filter(r => r.isNew),
      ],
    }))
  }

  const submit = async (send) => {
    if (saving) return
    setError('')
    if (!form.chantierId) { setError('Sélectionne un chantier.'); return }
    if (!form.date) { setError('La date est requise.'); return }
    if (next.date && next.date <= form.date) { setError('La prochaine réunion doit être après la date du CR.'); return }
    setSaving(true)
    try {
      const res = await saveCr({ form, rows, previousNext: initial?.prochaine_reunion || null })
      if (res.migrationMissing) {
        addToast('CR enregistré, mais le suivi des actions et la convocation demandent la migration 033 (Supabase).', 'warning')
      }
      if (res.failures.length) addToast(`Actions non enregistrées : ${res.failures.join(' ; ')}`, 'error')
      const st = crTaskStats(res.snapshot)
      const detail = [st.nouveau && `${st.nouveau} nouvelle${st.nouveau > 1 ? 's' : ''}`, st.fait && `${st.fait} soldée${st.fait > 1 ? 's' : ''}`,
        st.relance && `${st.relance} relancée${st.relance > 1 ? 's' : ''}`].filter(Boolean).join(', ')
      addToast(`CR n°${res.cr.numero} ${isEdit ? 'mis à jour' : 'créé'}${detail ? ` — actions : ${detail}` : ''}`, 'success')
      onSaved?.(res.cr, { send })
    } catch (e) {
      setError(e?.message || "Erreur lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  const prev = state?.previous
  return (
    <Modal open={open && !!state} onClose={() => !saving && onClose()} wide
      title={isEdit ? `Modifier le CR n°${initial.numero}` : 'Nouveau compte rendu'}>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : lockChantier ? '1fr 1fr' : '2fr 1fr 1fr', gap: '0 12px' }}>
        {!lockChantier && (
          <FF label="Chantier *">
            <select style={sel} value={form.chantierId || ''} disabled={isEdit}
              onChange={e => changeChantier(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {(data.chantiers || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </FF>
        )}
        <FF label="Date de la réunion *">
          <input type="date" style={inp} value={form.date || ''} onChange={e => changeDate(e.target.value)} />
        </FF>
        <FF label="N°" hint={prev ? `Précédent : n°${prev.numero} du ${fmtDate(prev.date)}` : form.chantierId ? 'Premier CR du chantier' : ''}>
          <input type="number" min="1" style={inp} value={form.numero || ''} onChange={e => setForm({ numero: e.target.value })} />
        </FF>
      </div>

      {form.chantierId && <>
        <div style={sectionTitle}>Intervenants</div>
        <CRIntervenantsPicker m={m} available={available} value={form.intervenants || []}
          onChange={(v) => setForm({ intervenants: v })} />
        <div style={{ marginTop: 8 }}>
          <FF label="Également présents (texte libre)">
            <input style={inp} value={form.participants || ''} onChange={e => setForm({ participants: e.target.value })}
              placeholder="Ex : 2 riverains, le bureau de contrôle" />
          </FF>
        </div>

        <FF label="Résumé des échanges">
          <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.resume || ''}
            onChange={e => setForm({ resume: e.target.value })} placeholder="Points abordés pendant la réunion…" />
        </FF>

        <div style={sectionTitle}>
          Suivi des actions
          {!isEdit && prev && <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B', textTransform: 'none', letterSpacing: 0 }}>reprises du CR n°{prev.numero}</span>}
        </div>
        <CRActionsEditor m={m} rows={rows} onChange={setRows} crId={initial?.id || null}
          crDate={form.date} nextDate={next.date} entreprises={entreprises} />

        <div style={{ marginTop: 12 }}>
          <FF label="Décisions">
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={form.decisions || ''}
              onChange={e => setForm({ decisions: e.target.value })} placeholder="Décisions prises pendant la réunion…" />
          </FF>
        </div>

        <div style={sectionTitle}>Prochaine réunion — convocation</div>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : '1fr 0.7fr 2fr', gap: '0 12px' }}>
          <FF label="Date">
            <input type="date" style={inp} value={next.date || ''} onChange={e => setNext({ date: e.target.value })} />
          </FF>
          <FF label="Heure">
            <input type="time" style={inp} value={next.heure || ''} onChange={e => setNext({ heure: e.target.value })} />
          </FF>
          <div style={{ gridColumn: m ? '1 / -1' : 'auto' }}>
            <FF label="Lieu">
              <input style={inp} value={next.lieu || ''} onChange={e => setNext({ lieu: e.target.value })} placeholder="Sur le chantier" />
            </FF>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: -4 }}>
          Imprimée sur la page de garde, ajoutée à l&apos;agenda et envoyée aux intervenants convoqués. Laisse la date vide s&apos;il n&apos;y a pas de réunion suivante.
        </div>
      </>}

      {error && (
        <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', marginTop: 12, fontSize: 12, color: '#B91C1C' }}>
          ⚠ {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} disabled={saving} style={btnS}>Annuler</button>
        <button type="button" onClick={() => submit(false)} disabled={saving} style={{ ...btnS, background: '#E2E8F0', color: '#1E3A5F' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => submit(true)} disabled={saving} style={btnP}>
          Enregistrer et envoyer
        </button>
      </div>
    </Modal>
  )
}
