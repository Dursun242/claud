import { render, screen } from '@testing-library/react'

// Réponses Supabase par table : { data, error }. Le constructeur de requête
// est chaînable et « thenable » comme celui de supabase-js.
const results = {}
// Appels notés : [table, méthode, ...arguments] et ['rpc', nom].
const calls = []
const builder = (table) => {
  const log = (name) => (...args) => { calls.push([table, name, ...args]); return q }
  const q = {
    select: () => q, order: () => q, limit: () => q, or: log('or'), single: () => q,
    eq: log('eq'), in: log('in'), ilike: log('ilike'), insert: log('insert'), update: log('update'),
    then: (ok, ko) => Promise.resolve(results[table] || { data: [], error: null }).then(ok, ko),
  }
  return q
}
jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table) => builder(table),
    rpc: (name) => { calls.push(['rpc', name]); return Promise.resolve(results[`rpc:${name}`] || { data: [], error: null }) },
  },
}))
// components/index.js ré-importe shared.js (cycle) : on ne garde que l'utile.
jest.mock('../../components', () => ({ ProgressBar: () => null }))

// eslint-disable-next-line import/first
import { SB, FF } from '../shared'

beforeEach(() => { for (const k of Object.keys(results)) delete results[k]; calls.length = 0 })

describe('SB.loadCritical', () => {
  it('charge les 4 tables quand tout répond', async () => {
    results.chantiers = { data: [{ id: 'c1' }], error: null }
    results.taches = { data: [{ id: 't1', chantier_id: 'c1' }], error: null }
    const r = await SB.loadCritical()
    expect(r.error).toBeUndefined()
    expect(r.chantiers).toHaveLength(1)
    expect(r.tasks).toEqual([expect.objectContaining({ id: 't1', chantierId: 'c1' })])
  })

  it.each(['chantiers', 'taches', 'compte_rendus', 'ordres_service'])(
    'renvoie une erreur si %s échoue (au lieu d’une liste vide)', async (table) => {
      results[table] = { data: null, error: { message: 'timeout' } }
      const r = await SB.loadCritical()
      expect(r.error).toBe(`Chargement ${table} impossible : timeout`)
    })
})

describe('SB.loadSecondary', () => {
  it.each(['contacts', 'planning', 'rdv', 'contact_chantiers'])(
    'lève si %s échoue (au lieu d’une liste vide)', async (table) => {
      results[table] = { data: null, error: { message: 'timeout' } }
      await expect(SB.loadSecondary()).rejects.toThrow(`Chargement ${table} impossible : timeout`)
    })

  it('RPC des compteurs absente (migration 020) : repli silencieux', async () => {
    results.contacts = { data: [{ id: 'ct1' }], error: null }
    results['rpc:chantier_attachment_counts'] = { data: null, error: { message: 'function does not exist' } }
    const r = await SB.loadSecondary()
    expect(r.contacts).toHaveLength(1)
    expect(r.attachmentCountsByChantier.size).toBe(0)
  })
})

describe('SB.loadForClient', () => {
  const callIndex = (pred) => calls.findIndex(pred)

  it('rattache d’abord (link_my_chantiers) puis filtre sur client_user_id', async () => {
    results.chantiers = { data: [{ id: 'c1', client: 'Jean' }], error: null }
    results.taches = { data: [{ id: 't1', chantier_id: 'c1' }], error: null }
    const r = await SB.loadForClient('u1')
    const rpc = callIndex(c => c[0] === 'rpc' && c[1] === 'link_my_chantiers')
    const filter = callIndex(c => c[0] === 'chantiers' && c[1] === 'or')
    expect(rpc).toBeGreaterThanOrEqual(0)
    expect(filter).toBeGreaterThan(rpc)
    // Compte rattaché, plus les chantiers de démo (filtrés par la RLS hors compte démo)
    expect(calls[filter]).toEqual(['chantiers', 'or', 'client_user_id.eq.u1,is_demo.eq.true'])
    expect(calls.some(c => c[1] === 'ilike')).toBe(false)
    expect(calls).toContainEqual(['taches', 'in', 'chantier_id', ['c1']])
    expect(r.chantiers).toEqual([expect.objectContaining({ id: 'c1', lots: [] })])
    expect(r.tasks).toEqual([expect.objectContaining({ id: 't1', chantierId: 'c1' })])
  })

  it.each(['42883', 'PGRST202'])('RPC absente (%s, migration 035) : ignorée sans bruit', async (code) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    results['rpc:link_my_chantiers'] = { data: null, error: { code, message: 'function does not exist' } }
    results.chantiers = { data: [{ id: 'c1' }], error: null }
    const r = await SB.loadForClient('u1')
    expect(r.chantiers).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('autre erreur de la RPC : signalée mais ne bloque pas le chargement', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    results['rpc:link_my_chantiers'] = { data: null, error: { code: '42501', message: 'permission denied' } }
    results.chantiers = { data: [{ id: 'c1' }], error: null }
    const r = await SB.loadForClient('u1')
    expect(r.chantiers).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('sans compte : résultat vide, aucune requête', async () => {
    const r = await SB.loadForClient('')
    expect(r.chantiers).toEqual([])
    expect(r.tasks).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('SB.upsertChantier', () => {
  beforeEach(() => {
    jest.spyOn(SB, 'log').mockImplementation(() => {})
    results.chantiers = { data: { id: 'c1', nom: 'N' }, error: null }
  })
  afterEach(() => jest.restoreAllMocks())
  const written = (method) => calls.find(c => c[0] === 'chantiers' && c[1] === method)[2]
  const ID = '00000000-0000-4000-8000-000000000001'

  it('n’écrit pas client_user_id si l’appelant ne le fournit pas', async () => {
    await SB.upsertChantier({ id: ID, nom: 'N', client: 'Jean' })
    expect(written('update')).not.toHaveProperty('client_user_id')
    await SB.upsertChantier({ nom: 'N', client: 'Jean' })
    expect(written('insert')).not.toHaveProperty('client_user_id')
  })

  it('écrit client_user_id s’il est fourni (vide → null)', async () => {
    await SB.upsertChantier({ id: ID, nom: 'N', client_user_id: 'u1' })
    expect(written('update')).toMatchObject({ client_user_id: 'u1' })
    calls.length = 0
    await SB.upsertChantier({ nom: 'N', client_user_id: '' })
    expect(written('insert')).toMatchObject({ client_user_id: null })
  })
})

describe('FF', () => {
  it('relie le label au champ natif unique', () => {
    render(<FF label="Nom"><input /></FF>)
    expect(screen.getByLabelText('Nom').tagName).toBe('INPUT')
  })

  it('garde l’id déjà défini sur le champ', () => {
    render(<FF label="Ville"><select id="ville"><option>Le Havre</option></select></FF>)
    expect(screen.getByLabelText('Ville')).toHaveAttribute('id', 'ville')
  })

  it('ne touche pas aux enfants multiples ou non natifs', () => {
    const Picker = (props) => <span data-testid="picker" {...props} />
    const { container } = render(<FF label="Adresse"><Picker /></FF>)
    expect(container.querySelector('label')).not.toHaveAttribute('for')
    expect(screen.getByTestId('picker')).not.toHaveAttribute('id')
  })
})
