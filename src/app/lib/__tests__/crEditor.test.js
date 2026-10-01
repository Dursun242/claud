import { buildEditorState, draftKey, toDraft, fromDraft, previewCr, pointsBySection } from '../crEditor'
import { GENERAL, newRow } from '../crSuivi'

const CH = 'ch-1'
const data = {
  chantiers: [{ id: CH, nom: 'Villa', lots: ['Électricité'], adresse: '3 rue du Port' }],
  compteRendus: [
    { id: 'cr-1', chantier_id: CH, numero: 1, date: '2026-09-23',
      prochaine_reunion: { date: '2026-09-30', heure: '14:00', lieu: 'Base vie' },
      sections: [{ lot: 'Électricité', entreprise: 'Martin Élec', avancement: 30 }],
      intervenants: [{ nom: 'Martin', convoque: true }] },
  ],
  tasks: [{ id: 't1', chantier_id: CH, titre: 'Tableau', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-25', lot: 'Électricité', num_point: 1 }],
  planning: [], ordresService: [],
}

describe('buildEditorState', () => {
  it('nouveau CR : suite du CR précédent', () => {
    const st = buildEditorState({ data, chantierId: CH, today: '2026-09-29' })
    expect(st.form).toMatchObject({ numero: 2, date: '2026-09-30', statut: 'Brouillon', prochaine_reunion: { date: '2026-10-07', heure: '14:00', lieu: 'Base vie' } })
    expect(st.form.intervenants).toEqual([expect.objectContaining({ nom: 'Martin', presence: 'Présent' })])
    expect(st.rows).toEqual([expect.objectContaining({ id: 't1', suivi: 'relance', lot: 'Électricité' })])
    expect(st.sections.map(s => s.lot)).toEqual([GENERAL, 'Électricité'])
    expect(st.sections[1]).toMatchObject({ entreprise: 'Martin Élec', avancement_prec: 30 })
  })
  it('sans chantier : formulaire vide', () => {
    const st = buildEditorState({ data, chantierId: '', today: '2026-09-29' })
    expect(st.rows).toEqual([])
    expect(st.sections).toEqual([])
  })
  it('CR existant : ses valeurs', () => {
    const st = buildEditorState({ data, initial: { ...data.compteRendus[0], chantierId: CH }, chantierId: CH })
    expect(st.form.numero).toBe(1)
    expect(st.previous).toBeNull()
    expect(st.sections.map(s => s.lot)).toEqual([GENERAL, 'Électricité'])
  })
})

describe('brouillon local', () => {
  it('clé par CR ou par chantier', () => {
    expect(draftKey({ id: 'abc' }, CH)).toBe('cr-draft:abc')
    expect(draftKey(null, CH)).toBe('cr-draft:new:ch-1')
  })
  it('aller-retour : tâches relues, tâche supprimée signalée', () => {
    const st = buildEditorState({ data, chantierId: CH, today: '2026-09-29' })
    const d = toDraft({ ...st, notes: 'notes', rows: [...st.rows, { key: 'gone', id: 'gone', titre: 'X', suivi: 'en_cours' }, newRow({ crDate: '2026-09-30' })] }, 123)
    expect(d.savedAt).toBe(123)
    expect(d.rows[0].orig).toBeUndefined()
    const back = fromDraft(JSON.parse(JSON.stringify(d)), { data })
    expect(back.notes).toBe('notes')
    expect(back.rows[0].orig).toBe(data.tasks[0])
    expect(back.rows[1]).toMatchObject({ missing: true, orig: null })
    expect(back.rows[2].isNew).toBe(true)
  })
})

describe('aperçu', () => {
  it('photos locales passées en images, points numérotés', () => {
    const st = buildEditorState({ data, chantierId: CH, today: '2026-09-29' })
    st.rows = [...st.rows, { ...newRow({ crDate: '2026-09-30', lot: 'Électricité' }), titre: 'Nouveau', photos: [{ dataUrl: 'data:image/jpeg;base64,AAA', legende: 'vue' }] }]
    st.sections[1].photos = [{ path: 'chantier/x/1.jpg' }]
    const { cr, images } = previewCr({ ...st, nextNum: 2 })
    expect(cr.taches_suivi.find(r => r.titre === 'Nouveau')).toMatchObject({ num: 2, photos: [{ path: 'local:1', legende: 'vue' }] })
    expect(images).toEqual({ 'local:1': 'data:image/jpeg;base64,AAA' })
    expect(cr.sections[1].photos).toEqual([{ path: 'chantier/x/1.jpg', legende: '' }])
  })
  it('compte des points par lot', () => {
    const st = buildEditorState({ data, chantierId: CH, today: '2026-09-29' })
    expect(pointsBySection(st.rows, st.sections)).toEqual({ generalites: { total: 0, relance: 0 }, electricite: { total: 1, relance: 1 } })
  })
})
