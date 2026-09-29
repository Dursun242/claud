import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('../../dashboards/shared', () => ({ SB: { upsertTask: jest.fn() }, defaultData: {} }))
jest.mock('../../auth', () => ({ useAuth: () => ({ user: { email: 'chef@idm.fr' } }) }))

// eslint-disable-next-line import/first
import { useSaveTask } from '../useSaveTask'
// eslint-disable-next-line import/first
import { DASHBOARD_KEYS } from '../useDashboardData'
// eslint-disable-next-line import/first
import { SB } from '../../dashboards/shared'
// eslint-disable-next-line import/first
import { readOutbox } from '../../lib/offlineStore'

const TASK = { id: 't1', titre: 'Poser la VMC', statut: 'En cours', chantier_id: 'c1', chantierId: 'c1' }

function setup() {
  const client = new QueryClient()
  client.setQueryData(DASHBOARD_KEYS.critical, { tasks: [TASK] })
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useSaveTask(), { wrapper })
  return { client, save: result.current }
}

beforeEach(() => { localStorage.clear(); jest.clearAllMocks() })

describe('useSaveTask', () => {
  it('en ligne : enregistre et met à jour le cache sans recharger', async () => {
    SB.upsertTask.mockResolvedValue({ ...TASK, statut: 'Terminé' })
    const { client, save } = setup()
    const reload = jest.fn()
    expect(await save({ ...TASK, statut: 'Terminé' }, reload)).toBe('saved')
    expect(reload).not.toHaveBeenCalled()
    expect(client.getQueryData(DASHBOARD_KEYS.critical).tasks[0].statut).toBe('Terminé')
  })

  it('sans réseau : appliqué à l’écran et mis en file d’attente', async () => {
    SB.upsertTask.mockRejectedValue(new Error('Erreur mise à jour tâche : TypeError: Failed to fetch'))
    const { client, save } = setup()
    expect(await save({ ...TASK, statut: 'Terminé' })).toBe('queued')
    expect(client.getQueryData(DASHBOARD_KEYS.critical).tasks[0].statut).toBe('Terminé')
    expect(readOutbox('chef@idm.fr')).toEqual([
      expect.objectContaining({ type: 'task', dedupeKey: 'task:t1', payload: expect.objectContaining({ statut: 'Terminé' }) }),
    ])
  })

  it('erreur métier (droits…) : remontée, rien en file', async () => {
    SB.upsertTask.mockRejectedValue(new Error('Erreur mise à jour tâche : permission denied'))
    const { save } = setup()
    await expect(save({ ...TASK, statut: 'Terminé' })).rejects.toThrow('permission denied')
    expect(readOutbox('chef@idm.fr')).toEqual([])
  })
})
