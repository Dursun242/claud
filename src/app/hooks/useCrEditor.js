'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cacheGet, cacheSet, cacheDelete } from '../lib/offlineStore'
import { buildEditorState, draftKey, toDraft, fromDraft, previewCr, draftIsNewer } from '../lib/crEditor'
import {
  initialRows, newRow, nextPointNumber, applyAiResult, defaultNextMeeting, lotKey, GENERAL, buildSections, markConvoques,
} from '../lib/crSuivi'
import { saveCr } from '../lib/crDb'

const AUTOSAVE_MS = 1200

/**
 * État et actions de l'éditeur de compte rendu.
 * - brouillon gardé sur l'appareil pendant la saisie (hors ligne compris),
 *   repris automatiquement à la réouverture s'il est plus récent que le CR
 *   enregistré (sinon proposé), effacé après enregistrement ;
 * - notes de dictée enregistrées avec le CR, avec la part déjà rangée par l'IA ;
 * - points, sections par lot, photos, dictée IA, enregistrement.
 */
export function useCrEditor({ open, initial, data }) {
  const [state, setState] = useState(null)
  const [draft, setDraft] = useState(null)        // brouillon local trouvé à l'ouverture (plus ancien que le CR)
  const [restoredAt, setRestoredAt] = useState(null) // brouillon local repris automatiquement
  const [localSavedAt, setLocalSavedAt] = useState(null)
  const dirty = useRef(false)
  const keyRef = useRef(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const chantierIdOf = (s) => s?.form?.chantierId || ''

  const lookForDraft = useCallback(async (key, initialCr) => {
    keyRef.current = key
    setDraft(null)
    setRestoredAt(null)
    const d = await cacheGet(key)
    if (keyRef.current !== key || !d?.form) return
    if (draftIsNewer(d, initialCr) && !dirty.current) {
      // Travail non enregistré sur cet appareil : on le reprend tel quel
      setState(s => fromDraft(d, { data: dataRef.current, previous: s?.previous || null }))
      setRestoredAt(d.savedAt || Date.now())
    } else {
      setDraft(d)
    }
  }, [])

  // Initialisation à l'ouverture uniquement (les rechargements de données
  // pendant la saisie ne doivent pas effacer ce qui est tapé).
  useEffect(() => {
    if (!open) { setState(null); setDraft(null); setRestoredAt(null); setLocalSavedAt(null); dirty.current = false; return }
    const chId = initial?.chantierId || initial?.chantier_id || ''
    setState(buildEditorState({ data: dataRef.current, initial, chantierId: chId }))
    dirty.current = false
    lookForDraft(draftKey(initial, chId), initial)
  }, [open, initial, lookForDraft])

  // Brouillon local (debounce)
  useEffect(() => {
    if (!state || !dirty.current) return
    const key = draftKey(initial, chantierIdOf(state))
    const t = setTimeout(() => {
      cacheSet(key, toDraft(state)).then(() => setLocalSavedAt(Date.now()))
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [state, initial])

  const mutate = useCallback((fn) => {
    dirty.current = true
    setDraft(null)
    setState(s => (s ? fn(s) : s))
  }, [])

  const restoreDraft = useCallback(() => {
    if (!draft) return
    setState(s => fromDraft(draft, { data: dataRef.current, previous: s?.previous || null }))
    setDraft(null)
    dirty.current = true
  }, [draft])

  const discardDraft = useCallback(() => {
    if (keyRef.current) cacheDelete(keyRef.current)
    setDraft(null)
  }, [])

  // Brouillon repris automatiquement : revenir à la version enregistrée
  const discardRestored = useCallback(() => {
    if (keyRef.current) cacheDelete(keyRef.current)
    const chId = initial?.chantierId || initial?.chantier_id || ''
    setState(buildEditorState({ data: dataRef.current, initial, chantierId: chId }))
    setRestoredAt(null)
    dirty.current = false
  }, [initial])

  const setForm = useCallback((p) => mutate(s => ({ ...s, form: { ...s.form, ...p } })), [mutate])
  const setNotes = useCallback((notes) => mutate(s => ({ ...s, notes: typeof notes === 'function' ? notes(s.notes) : notes })), [mutate])
  // Notes rangées par l'IA jusqu'à ce caractère (les suivantes restent « nouvelles »)
  const setNotesRangees = useCallback((n) => mutate(s => ({ ...s, notesRangees: Math.max(0, Number(n) || 0) })), [mutate])
  // Toute modification d'un point vaut « évoqué pendant la réunion »
  const updateRow = useCallback((key, p) => mutate(s => ({ ...s, rows: s.rows.map(r => (r.key === key ? { ...r, ...(typeof p === 'function' ? p(r) : p), vu: true } : r)) })), [mutate])
  const removeRow = useCallback((key) => mutate(s => ({ ...s, rows: s.rows.filter(r => r.key !== key) })), [mutate])
  const addRow = useCallback((lot) => mutate(s => {
    const section = s.sections.find(x => x.key === lotKey(lot))
    return {
      ...s,
      rows: [...s.rows, newRow({ crDate: s.form.date, nextDate: s.form.prochaine_reunion?.date, lot, entreprise: section?.entreprise || '' })],
    }
  }), [mutate])
  const updateSection = useCallback((key, p) => mutate(s => ({
    ...s, sections: s.sections.map(x => (x.key === key ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)),
  })), [mutate])
  const addSection = useCallback((lot) => {
    const name = String(lot || '').trim()
    if (!name) return
    mutate(s => (s.sections.some(x => x.key === lotKey(name)) ? s : {
      ...s,
      sections: [...s.sections, { key: lotKey(name), lot: name, entreprise: '', avancement: null, avancement_prec: null, prevu: null, observations: '', photos: [] }],
    }))
  }, [mutate])

  const changeChantier = useCallback((chId) => {
    dirty.current = false
    setState(buildEditorState({ data: dataRef.current, initial: null, chantierId: chId }))
    lookForDraft(draftKey(null, chId))
  }, [lookForDraft])

  const changeDate = useCallback((date) => mutate(s => {
    if (s.form.id) return { ...s, form: { ...s.form, date } }
    // Nouveau CR : les retards proposés et la réunion suivante suivent la date.
    // Les saisies sont conservées ; l'état proposé (retard → à relancer) ne
    // change que s'il n'a pas été choisi à la main.
    const d = dataRef.current
    const fresh = initialRows({ tasks: d.tasks || [], chantierId: s.form.chantierId, crDate: date, previous: s.previous })
    const chantier = (d.chantiers || []).find(c => c.id === s.form.chantierId)
    const prevu = new Map(buildSections({ chantier, previous: s.previous, rows: [], planning: d.planning || [], ordresService: d.ordresService || [], crDate: date }).map(x => [x.key, x.prevu]))
    return {
      ...s,
      form: { ...s.form, date, prochaine_reunion: { ...s.form.prochaine_reunion, date: defaultNextMeeting({ crDate: date, previous: s.previous }).date } },
      rows: [
        ...fresh.map(r => {
          const cur = s.rows.find(x => x.key === r.key)
          if (!cur) return r
          return cur.suivi !== cur.initialSuivi ? cur : { ...cur, suivi: r.suivi, initialSuivi: r.initialSuivi }
        }),
        ...s.rows.filter(r => r.isNew || !fresh.some(f => f.key === r.key)),
      ],
      sections: s.sections.map(x => (prevu.has(x.key) ? { ...x, prevu: prevu.get(x.key) } : x)),
    }
  }), [mutate])

  const applyAi = useCallback((result) => mutate(s => {
    const out = applyAiResult(
      { sections: s.sections, rows: s.rows, resume: s.form.resume, decisions: s.form.decisions, alertes: s.form.alertes },
      result, { crDate: s.form.date, nextDate: s.form.prochaine_reunion?.date },
    )
    return { ...s, sections: out.sections, rows: out.rows, form: { ...s.form, resume: out.resume, decisions: out.decisions, alertes: out.alertes } }
  }), [mutate])

  const nextNum = useMemo(() => nextPointNumber(data?.tasks || [], state?.form?.chantierId), [data?.tasks, state?.form?.chantierId])

  const save = useCallback(async ({ statut } = {}) => {
    if (!state) return null
    const res = await saveCr({
      form: {
        ...state.form, statut: statut || state.form.statut || 'Brouillon',
        // Absent alors que convoqué au CR précédent : noté dans le PDF et le mail
        intervenants: markConvoques(state.form.intervenants, state.previous),
      },
      rows: state.rows, sections: state.sections, nextNum,
      previousNext: initial?.prochaine_reunion || null,
      notes: state.notes || '', notesRangees: state.notesRangees || 0,
    })
    // Photos non envoyées : on garde le brouillon local pour ne pas les perdre
    if (!res.photoFailures.length) await cacheDelete(draftKey(initial, state.form.chantierId))
    dirty.current = false
    return res
  }, [state, nextNum, initial])

  const preview = useCallback(() => (state ? previewCr({ ...state, nextNum }) : null), [state, nextNum])

  return {
    state, draft, restoredAt, localSavedAt, nextNum, isEdit: !!initial?.id,
    setForm, setNotes, setNotesRangees, discardRestored, updateRow, removeRow, addRow, updateSection, addSection,
    changeChantier, changeDate, applyAi, restoreDraft, discardDraft, save, preview, GENERAL,
  }
}
