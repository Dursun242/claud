import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('../../dashboards/shared', () => ({
  SB: {
    loadForClient: jest.fn(),
  },
}))

// eslint-disable-next-line import/first
import { useClientDashboardData, clientDataKey } from '../useClientDashboardData'
// eslint-disable-next-line import/first
import { SB } from '../../dashboards/shared'

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
  SB.loadForClient.mockReset()
})

describe('useClientDashboardData', () => {
  it('renvoie EMPTY data si aucun compte connecté (enabled:false)', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useClientDashboardData(undefined), { wrapper })

    // Le fetch ne doit pas partir
    expect(SB.loadForClient).not.toHaveBeenCalled()
    // data est un EMPTY frozen object, pas null
    expect(result.current.data).toEqual({
      chantiers: [], contacts: [], tasks: [],
      planning: [], rdv: [], compteRendus: [], ordresService: [],
    })
  })

  it("charge les données du MOA et les renvoie", async () => {
    SB.loadForClient.mockResolvedValue({
      chantiers: [{ id: 'c1', client: 'Dupont' }],
      contacts: [], tasks: [{ id: 't1' }],
      planning: [], rdv: [], compteRendus: [], ordresService: [],
    })
    const { wrapper, client } = makeWrapper()

    const { result } = renderHook(() => useClientDashboardData('u-1'), { wrapper })

    await waitFor(() => expect(result.current.data.chantiers).toHaveLength(1))
    expect(result.current.data.tasks).toHaveLength(1)
    expect(SB.loadForClient).toHaveBeenCalledWith('u-1')
    // Cache (et cache hors ligne, préfixe 'dashboard') rangé sous l'id du compte
    expect(client.getQueryData(['dashboard', 'client', 'u-1']).chantiers).toHaveLength(1)
  })

  it('reload() déclenche un refetch', async () => {
    SB.loadForClient
      .mockResolvedValueOnce({ chantiers: [{ id: 'c1' }], contacts: [], tasks: [], planning: [], rdv: [], compteRendus: [], ordresService: [] })
      .mockResolvedValueOnce({ chantiers: [{ id: 'c1' }, { id: 'c2' }], contacts: [], tasks: [], planning: [], rdv: [], compteRendus: [], ordresService: [] })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useClientDashboardData('u-1'), { wrapper })
    await waitFor(() => expect(result.current.data.chantiers).toHaveLength(1))

    await act(async () => { await result.current.reload() })
    await waitFor(() => expect(result.current.data.chantiers).toHaveLength(2))
    expect(SB.loadForClient).toHaveBeenCalledTimes(2)
  })

  it('clientDataKey() génère une key stable par compte', () => {
    expect(clientDataKey('u-1')).toEqual(['dashboard', 'client', 'u-1'])
    expect(clientDataKey(null)).toEqual(['dashboard', 'client', ''])
  })
})
