import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockHook = { items: [], unreadCount: 0, markAsRead: jest.fn(), markAllRead: jest.fn(), newItemSignal: 0 }
jest.mock('../../hooks/useNotifications', () => {
  const actual = jest.requireActual('../../hooks/useNotifications')
  return { ...actual, useNotifications: () => mockHook }
})

import NotificationBell from '../NotificationBell'

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

beforeEach(() => {
  mockHook.items = []
  mockHook.unreadCount = 0
  mockHook.markAsRead = jest.fn()
  mockHook.markAllRead = jest.fn()
})

describe('NotificationBell', () => {
  it('badge : « 9+ » au-delà de 9 non-lues, nombre exact sinon, rien à 0', () => {
    mockHook.unreadCount = 120
    const { rerender } = render(<NotificationBell userEmail="moi@exemple.fr" />)
    const btn = screen.getByRole('button', { name: 'Activité récente' })
    expect(btn).toHaveTextContent('9+')
    expect(btn).not.toHaveTextContent('99+')

    mockHook.unreadCount = 3
    rerender(<NotificationBell userEmail="moi@exemple.fr" />)
    expect(btn).toHaveTextContent('3')

    mockHook.unreadCount = 0
    rerender(<NotificationBell userEmail="moi@exemple.fr" />)
    expect(btn.textContent).toBe('')
  })

  it('regroupe les notifications d’un même élément et marque tout le groupe comme lu', async () => {
    const user = userEvent.setup()
    const onNavigate = jest.fn()
    mockHook.unreadCount = 3
    mockHook.items = [
      { id: 'n1', entity_type: 'task', entity_id: 'T1', title: 'Tâche « Plâtre » modifiée', target_tab: 'tasks', read_at: null, created_at: iso(60e3) },
      { id: 'n2', entity_type: 'os', entity_id: 'O1', title: 'OS n°12 créé', target_tab: 'os', read_at: null, created_at: iso(120e3) },
      { id: 'n3', entity_type: 'task', entity_id: 'T1', title: 'Tâche « Plâtre » créée', target_tab: 'tasks', read_at: null, created_at: iso(180e3) },
      { id: 'n4', entity_type: 'task', entity_id: 'T1', title: 'Ancienne', target_tab: 'tasks', read_at: '2026-01-01', created_at: iso(240e3) },
    ]
    render(<NotificationBell userEmail="moi@exemple.fr" onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: 'Activité récente' }))

    // 2 lignes : la tâche (3 notifications) puis l'OS
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Tâche « Plâtre » modifiée')
    expect(rows[0]).toHaveTextContent('3 modifications')
    expect(rows[1]).not.toHaveTextContent('modifications')
    expect(screen.queryByText('Ancienne')).not.toBeInTheDocument()

    await user.click(screen.getByText('Tâche « Plâtre » modifiée'))
    expect(mockHook.markAsRead).toHaveBeenCalledWith(['n1', 'n3'])
    expect(onNavigate).toHaveBeenCalledWith('tasks', mockHook.items[0])
  })

  it('propose « Tout marquer comme lu » en tête de liste', async () => {
    const user = userEvent.setup()
    mockHook.unreadCount = 1
    mockHook.items = [{ id: 'n1', entity_type: 'os', entity_id: 'O1', title: 'OS', read_at: null, created_at: iso(0) }]
    render(<NotificationBell userEmail="moi@exemple.fr" />)
    await user.click(screen.getByRole('button', { name: 'Activité récente' }))
    await user.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }))
    expect(mockHook.markAllRead).toHaveBeenCalled()
  })
})
