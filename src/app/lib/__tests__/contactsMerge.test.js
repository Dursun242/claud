jest.mock('../../supabaseClient', () => ({ supabase: {} }))
jest.mock('../activityLog', () => ({ writeActivityLog: jest.fn() }))

import { mergeContacts } from '../contactsMerge'

function fakeSb({ fail = null, links = [] } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const q = { table, op: 'select', payload: null, filters: [] }
      const done = () => {
        calls.push(q)
        if (fail && fail(q)) return { data: null, error: { message: 'refusé' } }
        if (table === 'contact_chantiers' && q.op === 'select') return { data: links, error: null }
        if (q.op === 'update' && table === 'contacts') return { data: { id: 'keep', ...q.payload }, error: null }
        if (q.op === 'update') return { data: [{ id: 'x' }], error: null }
        return { data: null, error: null }
      }
      const b = {
        select: () => b,
        update: (p) => { q.op = 'update'; q.payload = p; return b },
        insert: (p) => { q.op = 'insert'; q.payload = p; return b },
        delete: () => { q.op = 'delete'; return b },
        eq: (k, v) => { q.filters.push(['eq', k, v]); return b },
        in: (k, v) => { q.filters.push(['in', k, v]); return b },
        single: async () => done(),
        then: (res, rej) => Promise.resolve(done()).then(res, rej),
      }
      return b
    },
  }
}

const keep = { id: 'keep', nom: 'Julien Debris' }
const drops = [{ id: 'd1', nom: 'M. DEBRIS Julien' }, { id: 'd2', nom: 'Julien Debris' }]

it('rattache affaires, échanges, chantiers, renomme OS / chantiers, puis supprime les doublons', async () => {
  const sb = fakeSb({ links: [
    { contact_id: 'keep', chantier_id: 'c1' },
    { contact_id: 'd1', chantier_id: 'c1' },
    { contact_id: 'd1', chantier_id: 'c2' },
    { contact_id: 'd2', chantier_id: 'c2' },
  ] })
  const { moved } = await mergeContacts({ keep, drops, fields: { nom: 'Julien Debris', email: 'j@ex.fr', id: 'ignoré' } }, sb)
  const seq = sb.calls.map(c => `${c.table}:${c.op}`)
  expect(seq).toEqual([
    'contacts:update', 'crm_opportunites:update', 'crm_interactions:update',
    'contact_chantiers:select', 'contact_chantiers:insert',
    'ordres_service:update', 'chantiers:update',
    'contacts:delete',
  ])
  expect(sb.calls[0].payload).toEqual({ nom: 'Julien Debris', email: 'j@ex.fr' })
  expect(sb.calls[1].filters).toEqual([['in', 'contact_id', ['d1', 'd2']]])
  expect(sb.calls[4].payload).toEqual([{ contact_id: 'keep', chantier_id: 'c2' }])
  expect(sb.calls[5]).toMatchObject({ payload: { artisan_nom: 'Julien Debris' }, filters: [['eq', 'artisan_nom', 'M. DEBRIS Julien']] })
  expect(sb.calls[7].filters).toEqual([['in', 'id', ['d1', 'd2']]])
  expect(moved).toEqual({ affaires: 1, echanges: 1, chantiers: 1, os: 1, chantiersRenommes: 1 })
})

it('échec avant la suppression : rien n’est supprimé', async () => {
  const sb = fakeSb({ fail: (q) => q.table === 'crm_interactions' })
  await expect(mergeContacts({ keep, drops, fields: { nom: 'Julien Debris' } }, sb)).rejects.toThrow('Fusion interrompue (échanges)')
  expect(sb.calls.some(c => c.op === 'delete')).toBe(false)
})

it('sans le module CRM (tables absentes) : la fusion continue', async () => {
  const sb = fakeSb()
  const from = sb.from.bind(sb)
  sb.from = (t) => {
    if (t.startsWith('crm_')) {
      const b = { update: () => b, in: () => b, select: () => b, then: (res) => res({ data: null, error: { code: '42P01', message: 'relation does not exist' } }) }
      return b
    }
    return from(t)
  }
  const { moved } = await mergeContacts({ keep, drops: [drops[0]], fields: { nom: 'Julien Debris' } }, sb)
  expect(moved.affaires).toBe(0)
  expect(sb.calls.some(c => c.op === 'delete')).toBe(true)
})

it('refuse une fusion vide', async () => {
  await expect(mergeContacts({ keep, drops: [keep], fields: {} }, fakeSb())).rejects.toThrow('Rien à fusionner')
})
