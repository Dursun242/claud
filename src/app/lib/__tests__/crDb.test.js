jest.mock('../../supabaseClient', () => ({ supabase: {} }))
jest.mock('../activityLog', () => ({ writeActivityLog: jest.fn() }))
jest.mock('../crPhotos', () => ({ uploadPhoto: jest.fn() }))

import { saveCr, isMissingColumn, markDiffused } from '../crDb'
import { initialRows, newRow } from '../crSuivi'

// Faux client Supabase : enregistre les écritures, erreurs programmables
function fakeSb({ missing033 = false } = {}) {
  const calls = []
  const sb = {
    calls,
    from(table) {
      const q = { table, op: null, payload: null, filters: [] }
      const done = () => {
        calls.push(q)
        const has033 = q.payload && ['taches_suivi', 'prochaine_reunion', 'sections', 'diffuse_le', 'entreprise', 'nb_rappels', 'cr_origine_id', 'num_point', 'photos']
          .some(k => k in q.payload)
        if (missing033 && has033) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'x' column in the schema cache" } }
        if (table === 'rdv') return { data: { id: 'rdv-1' }, error: null }
        return { data: { id: q.payload?.id || q.filters[0]?.[1], ...q.payload }, error: null }
      }
      const b = {
        insert: (p) => { q.op = 'insert'; q.payload = p; return b },
        update: (p) => { q.op = 'update'; q.payload = p; return b },
        delete: () => { q.op = 'delete'; return b },
        select: () => b,
        eq: (k, v) => { q.filters.push([k, v]); return b },
        single: async () => done(),
        maybeSingle: async () => done(),
        then: (res, rej) => Promise.resolve(done()).then(res, rej),
      }
      return b
    },
  }
  return sb
}

const CH = 'ch-1'
const tasks = [
  { id: 't-late', chantier_id: CH, titre: 'Reprise enduit', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-20', nb_rappels: 0, num_point: 1 },
]
const form = {
  chantierId: CH, date: '2026-09-30', numero: 4, resume: 'RAS',
  intervenants: [{ nom: 'Martin', societe: 'Martin Élec', convoque: true }, { nom: 'BET', convoque: false }],
  prochaine_reunion: { date: '2026-10-07', heure: '09:00', lieu: 'Chantier' },
}

describe('saveCr', () => {
  it('nouveau CR : agenda, CR avec photo et convocation, puis tâches', async () => {
    const sb = fakeSb()
    let n = 0
    const rows = [
      ...initialRows({ tasks, chantierId: CH, crDate: '2026-09-30' }),
      { ...newRow({ crDate: '2026-09-30' }), titre: 'Plans d’exécution', entreprise: 'Martin Élec' },
    ]
    const sections = [{ key: 'generalites', lot: 'Généralités', observations: 'RAS', photos: [] }]
    const res = await saveCr({ form, rows, sections, nextNum: 2, sb, newId: () => `id-${++n}` })

    const [rdv, cr, ins, upd] = sb.calls
    expect(rdv).toMatchObject({ table: 'rdv', op: 'insert', payload: expect.objectContaining({
      titre: 'Réunion de chantier n°5', date: '2026-10-07', participants: ['Martin (Martin Élec)'],
    }) })
    expect(cr).toMatchObject({ table: 'compte_rendus', op: 'insert' })
    expect(cr.payload).toMatchObject({
      id: 'id-1', numero: 4, chantier_id: CH,
      prochaine_reunion: { date: '2026-10-07', heure: '09:00', lieu: 'Chantier', rdv_id: 'rdv-1' },
    })
    expect(cr.payload.taches_suivi.map(s => s.suivi)).toEqual(['relance', 'nouveau'])
    expect(cr.payload.statut).toBe('Brouillon')
    expect(cr.payload.sections).toEqual([{ lot: 'Généralités', entreprise: '', avancement: null, avancement_prec: null, prevu: null, observations: 'RAS', photos: [] }])
    expect(ins).toMatchObject({ table: 'taches', op: 'insert', payload: expect.objectContaining({ id: 'id-2', cr_origine_id: 'id-1', cr_origine_numero: 4, num_point: 2 }) })
    expect(upd).toMatchObject({ table: 'taches', op: 'update', filters: [['id', 't-late']] })
    expect(upd.payload).toMatchObject({ nb_rappels: 1, priorite: 'Urgent', dernier_rappel_cr_id: 'id-1' })
    expect(res).toMatchObject({ migrationMissing: false, failures: [] })
  })

  it('modification : met à jour le CR et le rendez-vous existant', async () => {
    const sb = fakeSb()
    await saveCr({
      form: { ...form, id: '11111111-2222-3333-4444-555555555555' },
      rows: [], sb, previousNext: { date: '2026-10-06', rdv_id: 'rdv-9' },
    })
    expect(sb.calls[0]).toMatchObject({ table: 'rdv', op: 'update', filters: [['id', 'rdv-9']] })
    expect(sb.calls[1]).toMatchObject({ table: 'compte_rendus', op: 'update', filters: [['id', '11111111-2222-3333-4444-555555555555']] })
  })

  it('réunion suivante retirée : rendez-vous supprimé', async () => {
    const sb = fakeSb()
    await saveCr({ form: { ...form, prochaine_reunion: { date: '' } }, rows: [], sb, previousNext: { rdv_id: 'rdv-9' } })
    expect(sb.calls[0]).toMatchObject({ table: 'rdv', op: 'delete' })
    expect(sb.calls[1].payload.prochaine_reunion).toBeNull()
  })

  it('sans migration 033 : CR et tâches enregistrés sans les nouvelles colonnes', async () => {
    const sb = fakeSb({ missing033: true })
    const rows = [{ ...newRow({ crDate: '2026-09-30' }), titre: 'Action', entreprise: 'X' }]
    const res = await saveCr({ form, rows, sb, newId: () => 'id-x' })
    expect(res.migrationMissing).toBe(true)
    expect(res.failures).toEqual([])
    const crWrites = sb.calls.filter(c => c.table === 'compte_rendus')
    expect(crWrites).toHaveLength(2)
    expect(crWrites[1].payload).not.toHaveProperty('taches_suivi')
    const taskWrite = sb.calls.filter(c => c.table === 'taches').pop()
    expect(taskWrite.payload).toMatchObject({ titre: 'Action' })
    expect(taskWrite.payload).not.toHaveProperty('entreprise')
  })

  it('photos locales déposées avant l’enregistrement ; échec gardé en local', async () => {
    const sb = fakeSb()
    const upload = jest.fn()
      .mockResolvedValueOnce('chantier/ch-1/1.jpg')
      .mockRejectedValueOnce(new Error('réseau'))
    const rows = [{ ...newRow({ crDate: '2026-09-30' }), titre: 'Fissure', photos: [{ dataUrl: 'data:a', legende: 'fissure' }] }]
    const sections = [{ key: 'go', lot: 'Gros œuvre', photos: [{ dataUrl: 'data:b' }, { path: 'deja.jpg', legende: '' }] }]
    const res = await saveCr({ form, rows, sections, sb, upload, newId: () => 'id-p' })
    expect(upload).toHaveBeenCalledWith('data:a', CH)
    const cr = sb.calls.find(c => c.table === 'compte_rendus')
    expect(cr.payload.sections[0].photos).toEqual([{ path: 'deja.jpg', legende: '' }])
    expect(cr.payload.taches_suivi[0].photos).toEqual([{ path: 'chantier/ch-1/1.jpg', legende: 'fissure' }])
    expect(res.photoFailures).toEqual(['réseau'])
    expect(res.sections[0].photos[0]).toEqual({ dataUrl: 'data:b' })
  })

  it('CR déjà diffusé : reste diffusé', async () => {
    const sb = fakeSb()
    await saveCr({ form: { ...form, id: '11111111-2222-3333-4444-555555555555', statut: 'Diffusé' }, sb })
    expect(sb.calls.find(c => c.table === 'compte_rendus').payload.statut).toBe('Diffusé')
  })

  it('markDiffused', async () => {
    const sb = fakeSb()
    expect(await markDiffused('cr-9', sb)).toBe(true)
    expect(sb.calls[0]).toMatchObject({ table: 'compte_rendus', op: 'update', filters: [['id', 'cr-9']], payload: expect.objectContaining({ statut: 'Diffusé' }) })
  })

  it('reconnaît une colonne absente', () => {
    expect(isMissingColumn({ code: '42703' })).toBe(true)
    expect(isMissingColumn({ message: 'column "x" does not exist' })).toBe(true)
    expect(isMissingColumn({ code: '23505' })).toBe(false)
  })
})
