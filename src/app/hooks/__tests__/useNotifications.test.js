// Faux client Supabase : enregistre chaque requête (méthode + arguments)
const mockState = { queries: [], list: [], count: 0, handler: null }
jest.mock('../../supabaseClient', () => {
  const builder = (q) => {
    const b = {}
    for (const m of ['select', 'or', 'order', 'limit', 'is', 'gte', 'update', 'eq', 'in']) {
      b[m] = (...args) => { q.calls.push([m, ...args]); return b }
    }
    b.then = (resolve, reject) => {
      const head = q.calls.some(([m, , opts]) => m === 'select' && opts?.head)
      const res = head ? { count: mockState.count } : { data: mockState.list, error: null }
      return Promise.resolve(res).then(resolve, reject)
    }
    return b
  }
  const channel = {
    on: (_evt, _filter, cb) => { mockState.handler = cb; return channel },
    subscribe: () => channel,
  }
  return {
    supabase: {
      from: (table) => { const q = { table, calls: [] }; mockState.queries.push(q); return builder(q) },
      channel: () => channel,
      removeChannel: jest.fn(),
    },
  }
})

import { renderHook, act, waitFor } from '@testing-library/react'
import { useNotifications, groupNotifications, badgeLabel, BADGE_WINDOW_DAYS } from '../useNotifications'

const DAY = 24 * 3600 * 1000
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

beforeEach(() => {
  mockState.queries = []
  mockState.list = []
  mockState.count = 0
  mockState.handler = null
})

describe('badgeLabel', () => {
  it('affiche le nombre jusqu’à 9, puis « 9+ »', () => {
    expect(badgeLabel(1)).toBe('1')
    expect(badgeLabel(9)).toBe('9')
    expect(badgeLabel(10)).toBe('9+')
    expect(badgeLabel(250)).toBe('9+')
  })
})

describe('groupNotifications', () => {
  it('regroupe un même élément, la plus récente en tête, avec le nombre', () => {
    const list = [
      { id: 'n1', entity_type: 'task', entity_id: 'T1', title: 'Tâche modifiée (3)', read_at: null },
      { id: 'n2', entity_type: 'os', entity_id: 'O1', title: 'OS créé', read_at: null },
      { id: 'n3', entity_type: 'task', entity_id: 'T1', title: 'Tâche modifiée (2)', read_at: '2026-01-01' },
      { id: 'n4', entity_type: 'task', entity_id: 'T1', title: 'Tâche modifiée (1)', read_at: null },
      { id: 'n5', entity_type: 'os', entity_id: 'T1', title: 'Même id, autre type', read_at: null },
    ]
    const groups = groupNotifications(list)
    expect(groups.map(g => g.key)).toEqual(['task:T1', 'os:O1', 'os:T1'])
    expect(groups[0].latest.id).toBe('n1')
    expect(groups[0].count).toBe(3)
    expect(groups[0].ids).toEqual(['n1', 'n3', 'n4'])
    expect(groups[0].unreadIds).toEqual(['n1', 'n4'])
    expect(groups[1].count).toBe(1)
  })

  it('ne regroupe pas les notifications sans entity_id et limite le nombre de lignes', () => {
    const list = [
      { id: 'a', entity_type: 'chantier', entity_id: null },
      { id: 'b', entity_type: 'chantier', entity_id: null },
    ]
    expect(groupNotifications(list)).toHaveLength(2)
    expect(groupNotifications(list, 1)).toHaveLength(1)
  })
})

describe('useNotifications', () => {
  it('compte les non-lues des 7 derniers jours, hors actions de l’utilisateur', async () => {
    mockState.count = 4
    const { result } = renderHook(() => useNotifications('Moi@Exemple.fr '))
    await waitFor(() => expect(result.current.unreadCount).toBe(4))

    const countQ = mockState.queries.find(q => q.calls.some(([m, , o]) => m === 'select' && o?.head))
    const calls = Object.fromEntries(countQ.calls.map(([m, ...a]) => [m, a]))
    expect(calls.is).toEqual(['read_at', null])
    // fenêtre de 7 jours
    const since = new Date(calls.gte[1]).getTime()
    expect(calls.gte[0]).toBe('created_at')
    expect(Math.abs(Date.now() - BADGE_WINDOW_DAYS * DAY - since)).toBeLessThan(5000)
    // auteur ≠ moi (email normalisé en minuscules), actions système (NULL) gardées
    expect(calls.or[0]).toBe('actor_email.is.null,actor_email.neq."moi@exemple.fr"')

    // la liste exclut aussi mes propres actions
    const listQ = mockState.queries.find(q => q !== countQ && q.calls.some(([m]) => m === 'order'))
    expect(listQ.calls.find(([m]) => m === 'or')[1]).toBe('actor_email.is.null,actor_email.neq."moi@exemple.fr"')
  })

  it('marque tout un groupe comme lu et décompte seulement les non-lues de la fenêtre', async () => {
    // 3 au compteur (valeur arbitraire) : seules n1 et n2 doivent être retirées
    mockState.count = 3
    mockState.list = [
      { id: 'n1', entity_type: 'task', entity_id: 'T1', read_at: null, created_at: iso(1000) },
      { id: 'n2', entity_type: 'task', entity_id: 'T1', read_at: null, created_at: iso(2 * DAY) },
      { id: 'n3', entity_type: 'task', entity_id: 'T1', read_at: null, created_at: iso(10 * DAY) },
    ]
    const { result } = renderHook(() => useNotifications('moi@exemple.fr'))
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    mockState.queries = []
    await act(async () => { await result.current.markAsRead(['n1', 'n2', 'n3']) })

    const upd = mockState.queries[0]
    expect(upd.calls.find(([m]) => m === 'update')[1]).toHaveProperty('read_at')
    expect(upd.calls.find(([m]) => m === 'in')).toEqual(['in', 'id', ['n1', 'n2', 'n3']])
    expect(result.current.items.every(n => n.read_at)).toBe(true)
    // n3 (10 jours) n'était pas dans le badge
    expect(result.current.unreadCount).toBe(1)
  })

  it('temps réel : signal seulement pour un INSERT d’un autre auteur, après rechargement', async () => {
    const { result } = renderHook(() => useNotifications('moi@exemple.fr'))
    await waitFor(() => expect(mockState.handler).toBeTruthy())

    await act(async () => {
      mockState.handler({ eventType: 'INSERT', new: { actor_email: 'MOI@exemple.fr' } })
      await Promise.resolve()
    })
    expect(result.current.newItemSignal).toBe(0)

    mockState.list = [{ id: 'x', entity_type: 'os', entity_id: 'O1', read_at: null, created_at: iso(0) }]
    await act(async () => {
      mockState.handler({ eventType: 'INSERT', new: { actor_email: 'collegue@exemple.fr' } })
    })
    await waitFor(() => expect(result.current.newItemSignal).toBe(1))
    expect(result.current.items[0].id).toBe('x')

    await act(async () => { mockState.handler({ eventType: 'UPDATE', new: { actor_email: null } }) })
    expect(result.current.newItemSignal).toBe(1)
  })
})
