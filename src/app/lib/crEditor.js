// État de l'éditeur de compte rendu (logique pure, testée dans
// __tests__/crEditor.test.js) : construction à l'ouverture, brouillon local,
// aperçu PDF avant enregistrement.
import { localISO } from './today'
import {
  previousCr, nextCrNumero, initialRows, buildSections, carryIntervenants,
  defaultNextMeeting, defaultCrDate, planCrTasks, sectionsForDb, lotKey,
} from './crSuivi'

const chOf = (x) => x?.chantierId || x?.chantier_id || null

/** État initial : CR existant (`initial.id`) ou nouveau CR du chantier. */
export function buildEditorState({ data = {}, initial = null, chantierId, today = localISO() }) {
  const crs = data.compteRendus || []
  const chantier = (data.chantiers || []).find(c => c.id === chantierId) || null
  const ctx = { chantier, planning: data.planning || [], ordresService: data.ordresService || [], contacts: data.contacts || [] }
  if (initial?.id) {
    const previous = previousCr(crs, chantierId, { numero: initial.numero, excludeId: initial.id })
    const rows = initialRows({ tasks: data.tasks || [], chantierId, crDate: initial.date, cr: initial })
    return {
      form: {
        ...initial, chantierId,
        intervenants: initial.intervenants || [],
        prochaine_reunion: initial.prochaine_reunion || { date: '', heure: '', lieu: '' },
      },
      rows,
      sections: buildSections({ ...ctx, previous, cr: initial, rows, crDate: initial.date }),
      notes: '',
      previous,
    }
  }
  const previous = chantierId ? previousCr(crs, chantierId) : null
  const date = defaultCrDate(previous, today)
  const rows = chantierId ? initialRows({ tasks: data.tasks || [], chantierId, crDate: date, previous }) : []
  return {
    form: {
      chantierId: chantierId || '', date, numero: chantierId ? nextCrNumero(crs, chantierId) : 1,
      resume: '', participants: '', decisions: '', statut: 'Brouillon',
      intervenants: carryIntervenants(previous),
      prochaine_reunion: defaultNextMeeting({ crDate: date, previous, chantier }),
    },
    rows,
    sections: chantierId ? buildSections({ ...ctx, previous, rows, crDate: date }) : [],
    notes: '',
    previous,
  }
}

/** Clé du brouillon local (un par CR, ou un par chantier pour un nouveau CR). */
export const draftKey = (initial, chantierId) =>
  (initial?.id ? `cr-draft:${initial.id}` : `cr-draft:new:${chantierId || ''}`)

/** Brouillon enregistrable sur l'appareil (sans les tâches d'origine). */
export function toDraft(state, now = Date.now()) {
  return {
    savedAt: now,
    form: state.form,
    rows: state.rows.map(({ orig, ...r }) => r), // eslint-disable-line no-unused-vars
    sections: state.sections,
    notes: state.notes || '',
  }
}

/** Reprise d'un brouillon : tâches d'origine relues depuis les données à jour. */
export function fromDraft(draft, { data = {}, previous = null }) {
  const byId = new Map((data.tasks || []).map(t => [t.id, t]))
  return {
    form: draft.form,
    rows: (draft.rows || []).map(r => {
      if (r.isNew || !r.id) return r
      const orig = byId.get(r.id)
      return orig ? { ...r, orig } : { ...r, orig: null, missing: true }
    }),
    sections: draft.sections || [],
    notes: draft.notes || '',
    previous,
  }
}

/**
 * CR tel qu'il serait enregistré (aperçu PDF avant enregistrement). Les
 * photos encore sur l'appareil reçoivent un chemin « local:n » et leur image
 * est renvoyée dans `images`.
 */
export function previewCr(state) {
  const images = {}
  let n = 0
  const mapPhotos = (list = []) => list.map(p => {
    if (p?.path) return p
    if (!p?.dataUrl) return p
    const path = `local:${++n}`
    images[path] = p.dataUrl
    return { path, legende: p.legende || '' }
  })
  const rows = state.rows.map(r => ({ ...r, photos: mapPhotos(r.photos) }))
  const sections = state.sections.map(s => ({ ...s, photos: mapPhotos(s.photos) }))
  let seq = 0
  const plan = planCrTasks({
    rows, crId: state.form.id || 'apercu', crNumero: state.form.numero, chantierId: chOf(state.form),
    newId: () => `apercu-${++seq}`, nextNum: state.nextNum || 1,
  })
  const next = state.form.prochaine_reunion?.date ? state.form.prochaine_reunion : null
  return {
    cr: { ...state.form, taches_suivi: plan.snapshot, sections: sectionsForDb(sections), prochaine_reunion: next },
    images,
  }
}

/** Nombre de points par lot (badges de navigation). */
export function pointsBySection(rows = [], sections = []) {
  const out = Object.fromEntries(sections.map(s => [s.key, { total: 0, relance: 0 }]))
  for (const r of rows) {
    const k = lotKey(r.lot)
    if (!out[k]) out[k] = { total: 0, relance: 0 }
    out[k].total += 1
    if (r.suivi === 'relance') out[k].relance += 1
  }
  return out
}
