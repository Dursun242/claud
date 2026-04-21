import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// On mocke SB.loadCritical et SB.loadSecondary. Le hook les lit via
// dashboards/shared — on intercepte au niveau module.
jest.mock('../../dashboards/shared', () => ({
  SB: {
    loadCritical: jest.fn(),
    loadSecondary: jest.fn(),
  },
  defaultData: {
    chantiers: [], contacts: [], tasks: [],
    planning: [], rdv: [], compteRendus: [], ordresService: [],
  },
}))

// eslint-disable-next-line import/first
import { useDashboardData, DASHBOARD_KEYS } from '../useDashboardData'
// eslint-disable-next-line import/first
import { SB } from '../../dashboards/shared'

// Wrapper qui fournit un QueryClient isolé à chaque test (évite les leaks
// de cache entre tests — sinon le 2e test voit les données du 1er).
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { wrapper, client }
}

beforeEach(() => {
  SB.loadCritical.mockReset()
  SB.loadSecondary.mockReset()
})

describe('useDashboardData', () => {
  it('démarre avec loading=true et data=null', () => {
    SB.loadCritical.mockResolvedValue({ chantiers: [], tasks: [], compteRendus: [], ordresService: [], _demoIds: new Set() })
    SB.loadSecondary.mockResolvedValue({ contacts: [], planning: [], rdv: [], attachmentCountsByChantier: new Map() })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.hasChantiers).toBeNull()
  })

  it('charge critical puis secondary et merge les deux', async () => {
    SB.loadCritical.mockResolvedValue({
      chantiers: [{ id: 'c1', nom: 'Villa A' }],
      tasks: [{ id: 't1' }],
      compteRendus: [],
      ordresService: [{ id: 'os1' }],
      _demoIds: new Set(),
    })
    SB.loadSecondary.mockResolvedValue({
      contacts: [{ id: 'ct1', nom: 'Dupont' }],
      planning: [],
      rdv: [],
      attachmentCountsByChantier: new Map([['c1', 3]]),
    })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })

    // Attend que le merge soit effectif (secondary arrivée)
    await waitFor(() => expect(result.current.data?.contacts?.length).toBe(1))

    expect(result.current.loading).toBe(false)
    expect(result.current.data.chantiers).toHaveLength(1)
    expect(result.current.data.tasks).toHaveLength(1)
    expect(result.current.data.ordresService).toHaveLength(1)
    expect(result.current.data.contacts).toEqual([{ id: 'ct1', nom: 'Dupont' }])
    expect(result.current.data.attachmentCountsByChantier.get('c1')).toBe(3)
    expect(result.current.hasChantiers).toBe(true)
  })

  it('filtre les items secondary dont chantier_id est un démo UUID', async () => {
    SB.loadCritical.mockResolvedValue({
      chantiers: [{ id: 'c-real' }],
      tasks: [], compteRendus: [], ordresService: [],
      _demoIds: new Set(['c-demo']),
    })
    SB.loadSecondary.mockResolvedValue({
      contacts: [],
      planning: [{ id: 'p1', chantier_id: 'c-real' }, { id: 'p2', chantier_id: 'c-demo' }],
      rdv: [{ id: 'r1', chantier_id: 'c-demo' }],
      attachmentCountsByChantier: new Map(),
    })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })
    await waitFor(() => expect(result.current.data).not.toBeNull())
    await waitFor(() => expect(result.current.data.planning).toBeDefined())

    // p2 (démo) est filtré, p1 reste
    expect(result.current.data.planning).toHaveLength(1)
    expect(result.current.data.planning[0].id).toBe('p1')
    // r1 (démo) est filtré
    expect(result.current.data.rdv).toHaveLength(0)
  })

  it("hasChantiers=false quand critical renvoie chantiers=[]", async () => {
    SB.loadCritical.mockResolvedValue({
      chantiers: [], tasks: [], compteRendus: [], ordresService: [],
      _demoIds: new Set(),
    })
    SB.loadSecondary.mockResolvedValue({
      contacts: [], planning: [], rdv: [],
      attachmentCountsByChantier: new Map(),
    })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })
    await waitFor(() => expect(result.current.hasChantiers).toBe(false))
  })

  it('propage l\'erreur si loadCritical jette', async () => {
    SB.loadCritical.mockRejectedValue(new Error('DB down'))
    SB.loadSecondary.mockResolvedValue({})
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error.message).toMatch(/DB down/)
  })

  it("propage l'erreur si loadCritical renvoie { error }", async () => {
    SB.loadCritical.mockResolvedValue({ error: 'RLS denied' })
    SB.loadSecondary.mockResolvedValue({})
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error.message).toMatch(/RLS denied/)
  })

  it('reload() invalide les deux queries → refetch', async () => {
    SB.loadCritical
      .mockResolvedValueOnce({ chantiers: [{ id: 'c1' }], tasks: [], compteRendus: [], ordresService: [], _demoIds: new Set() })
      .mockResolvedValueOnce({ chantiers: [{ id: 'c1' }, { id: 'c2' }], tasks: [], compteRendus: [], ordresService: [], _demoIds: new Set() })
    SB.loadSecondary.mockResolvedValue({ contacts: [], planning: [], rdv: [], attachmentCountsByChantier: new Map() })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useDashboardData(), { wrapper })
    await waitFor(() => expect(result.current.data?.chantiers).toHaveLength(1))

    // reload → refetch les 2 queries
    await act(async () => { await result.current.reload() })

    await waitFor(() => expect(result.current.data.chantiers).toHaveLength(2))
    expect(SB.loadCritical).toHaveBeenCalledTimes(2)
  })

  it("secondary n'est pas appelé tant que critical n'a pas résolu", async () => {
    // critical met 50ms à résoudre
    let resolveCritical
    SB.loadCritical.mockReturnValue(new Promise(r => { resolveCritical = r }))
    SB.loadSecondary.mockResolvedValue({})
    const { wrapper } = makeWrapper()

    renderHook(() => useDashboardData(), { wrapper })

    // À ce stade, secondary n'a PAS encore été appelé
    expect(SB.loadSecondary).not.toHaveBeenCalled()

    // On résout critical → secondary doit partir
    resolveCritical({ chantiers: [], tasks: [], compteRendus: [], ordresService: [], _demoIds: new Set() })
    await waitFor(() => expect(SB.loadSecondary).toHaveBeenCalledTimes(1))
  })

  it('DASHBOARD_KEYS exporte les deux query keys', () => {
    expect(DASHBOARD_KEYS.critical).toEqual(['dashboard', 'admin', 'critical'])
    expect(DASHBOARD_KEYS.secondary).toEqual(['dashboard', 'admin', 'secondary'])
  })
})
