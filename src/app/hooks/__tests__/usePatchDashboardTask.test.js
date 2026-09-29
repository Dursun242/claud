import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('../../dashboards/shared', () => ({ SB: {}, defaultData: {} }))

// eslint-disable-next-line import/first
import { usePatchDashboardTask, DASHBOARD_KEYS } from '../useDashboardData'

function setup(cached) {
  const client = new QueryClient()
  if (cached) client.setQueryData(DASHBOARD_KEYS.critical, cached)
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => usePatchDashboardTask(), { wrapper })
  return { client, patch: result.current }
}

describe('usePatchDashboardTask', () => {
  it('remplace la tâche dans le cache (avec chantierId) sans rien recharger', () => {
    const { client, patch } = setup({ chantiers: [], tasks: [{ id: 't1', statut: 'En cours', chantierId: 'c1' }] })
    expect(patch({ id: 't1', statut: 'Terminé', chantier_id: 'c1' })).toBe(true)
    expect(client.getQueryData(DASHBOARD_KEYS.critical).tasks).toEqual([
      { id: 't1', statut: 'Terminé', chantier_id: 'c1', chantierId: 'c1' },
    ])
  })

  it('renvoie false si la tâche n’est pas en cache (l’appelant recharge)', () => {
    expect(setup(null).patch({ id: 't1' })).toBe(false)
    expect(setup({ tasks: [] }).patch({ id: 't1' })).toBe(false)
    expect(setup({ tasks: [{ id: 't1' }] }).patch(undefined)).toBe(false)
  })
})
