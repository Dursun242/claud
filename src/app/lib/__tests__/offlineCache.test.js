import { QueryClient } from '@tanstack/react-query'

const store = new Map()
jest.mock('../offlineStore', () => ({
  cacheGet: jest.fn(async (k) => store.get(k)),
  cacheSet: jest.fn(async (k, v) => { store.set(k, v) }),
}))

// eslint-disable-next-line import/first
import { restoreQueries, persistQueries } from '../offlineCache'

beforeEach(() => { store.clear(); jest.useRealTimers() })

describe('offlineCache', () => {
  it('sauvegarde les données métier après chargement, pas les autres requêtes', async () => {
    jest.useFakeTimers()
    const qc = new QueryClient()
    const stop = persistQueries(qc, 'Chef@IDM.fr', { delay: 10 })
    await qc.fetchQuery({ queryKey: ['dashboard', 'admin', 'critical'], queryFn: async () => ({ chantiers: [{ id: 'c1' }], _demoIds: new Set() }) })
    await qc.fetchQuery({ queryKey: ['autre'], queryFn: async () => 'x' })
    jest.advanceTimersByTime(20)
    stop()
    const saved = store.get('queries:chef@idm.fr')
    expect(saved.entries.map(e => e.key)).toEqual([['dashboard', 'admin', 'critical']])
    expect(saved.entries[0].data.chantiers).toEqual([{ id: 'c1' }])
  })

  it('restaure seulement les requêtes encore vides', async () => {
    store.set('queries:chef@idm.fr', {
      savedAt: 1234,
      entries: [
        { key: ['dashboard', 'admin', 'critical'], data: { chantiers: ['ancien'] }, updatedAt: 1 },
        { key: ['crm', 'all'], data: { opportunites: ['ancien'] }, updatedAt: 1 },
      ],
    })
    const qc = new QueryClient()
    qc.setQueryData(['crm', 'all'], { opportunites: ['frais'] })
    expect(await restoreQueries(qc, 'chef@idm.fr')).toBe(1234)
    expect(qc.getQueryData(['dashboard', 'admin', 'critical'])).toEqual({ chantiers: ['ancien'] })
    expect(qc.getQueryData(['crm', 'all'])).toEqual({ opportunites: ['frais'] })
  })

  it('rien à restaurer → null', async () => {
    expect(await restoreQueries(new QueryClient(), 'x@y.fr')).toBeNull()
  })
})
