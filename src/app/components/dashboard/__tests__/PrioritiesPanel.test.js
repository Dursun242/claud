import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }) } },
}))

// eslint-disable-next-line import/first
import PrioritiesPanel from '../PrioritiesPanel'

const TODAY = '2026-09-22'
const make = (prefix) => ({
  top: [
    { id: `${prefix}1`, kind: 'task', title: `${prefix} Étayer le plancher`, reason: 'Urgente, en retard de 2 jours', tab: 'tasks', focus: 't2', score: 87 },
    { id: `${prefix}2`, kind: 'rdv', title: `${prefix} Visite MOA`, reason: 'Rendez-vous à 14 h', tab: 'planning', focus: null, score: 80 },
    { id: `${prefix}3`, kind: 'chaud', title: `${prefix} Devis 26-002`, reason: 'Devis de 12 000 € ouvert hier, pas encore signé', tab: 'crm', focus: 'o2', score: 61 },
  ],
  rest: [{ id: `${prefix}4`, kind: 'os', title: 'OS', reason: 'OS envoyé', tab: 'os', focus: 'os1', score: 25 }],
  total: 4,
})
const reply = (text) => Promise.resolve({ ok: true, json: async () => ({ content: [{ type: 'text', text }] }) })

let onLine
beforeEach(() => {
  window.localStorage.clear()
  global.fetch = jest.fn(() => reply('Commence par étayer le plancher, puis appelle le client du loft.'))
  onLine = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => { onLine.mockRestore(); delete global.fetch })

it('affiche les 3 priorités numérotées et ouvre l’élément au clic', async () => {
  const onOpen = jest.fn()
  const user = userEvent.setup()
  render(<PrioritiesPanel priorities={make('A')} onOpen={onOpen} userId="u1" today={TODAY} m />)

  expect(screen.getByRole('heading', { name: /Mes priorités du jour/ })).toBeInTheDocument()
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows.map(r => r.textContent.trim()[0])).toEqual(['1', '2', '3'])
  expect(screen.getByText('Rendez-vous à 14 h')).toBeInTheDocument()
  expect(screen.getByText('+ 1 autre point plus bas')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /A Étayer le plancher/ }))
  expect(onOpen).toHaveBeenCalledWith('tasks', 't2')
  await user.click(screen.getByRole('button', { name: /A Devis 26-002/ }))
  expect(onOpen).toHaveBeenCalledWith('crm', 'o2')
  expect(await screen.findByText(/Commence par étayer le plancher/)).toBeInTheDocument()
})

it('le mot du jour : un seul appel par jour et par liste, mis en cache', async () => {
  const p = make('B')
  const { unmount } = render(<PrioritiesPanel priorities={p} onOpen={() => {}} userId="u1" today={TODAY} />)
  expect(await screen.findByText('Le mot du jour')).toBeInTheDocument()
  expect(screen.getByText(/appelle le client du loft/)).toBeInTheDocument()

  expect(global.fetch).toHaveBeenCalledTimes(1)
  const [url, opts] = global.fetch.mock.calls[0]
  expect(url).toBe('/api/claude')
  expect(opts.headers.Authorization).toBe('Bearer jeton')
  const body = JSON.parse(opts.body)
  expect(body.messages).toHaveLength(1)
  expect(body.messages[0].content).toContain('1. B Étayer le plancher — Urgente, en retard de 2 jours')
  expect(body.messages[0].content).toContain('(et 1 autre point moins urgent)')
  expect(body.messages[0].content).not.toContain('t2') // pas d'identifiants ni de données inutiles
  const keys = Object.keys(window.localStorage)
  expect(keys).toHaveLength(1)
  expect(keys[0]).toMatch(/^mot-du-jour:u1:2026-09-22:/)

  // Second rendu le même jour : relu depuis le cache, pas de nouvel appel
  unmount()
  render(<PrioritiesPanel priorities={{ ...p, top: [...p.top] }} onOpen={() => {}} userId="u1" today={TODAY} />)
  expect(screen.getByText(/appelle le client du loft/)).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

it('sans priorité : ligne compacte, pas d’appel IA', () => {
  render(<PrioritiesPanel priorities={{ top: [], rest: [], total: 0 }} onOpen={() => {}} userId="u1" today={TODAY} />)
  expect(screen.getByText("Rien d'urgent : bonne journée")).toBeInTheDocument()
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
})

it('hors ligne : pas d’appel IA', async () => {
  onLine.mockReturnValue(false)
  render(<PrioritiesPanel priorities={make('C')} onOpen={() => {}} userId="u1" today={TODAY} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  await new Promise(r => setTimeout(r, 0))
  expect(global.fetch).not.toHaveBeenCalled()
  expect(screen.queryByText('Le mot du jour')).not.toBeInTheDocument()
})

it('erreur de l’IA : rien d’affiché, les priorités restent', async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))
  render(<PrioritiesPanel priorities={make('D')} onOpen={() => {}} userId="u1" today={TODAY} />)
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByText('Le mot du jour')).not.toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
})
