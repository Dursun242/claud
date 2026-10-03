import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: jest.fn() }) }))
jest.mock('../../supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))
// shared.js importe components/index.js qui ré-importe shared.js (cycle) :
// on mocke le strict nécessaire.
jest.mock('../../dashboards/shared', () => ({
  SB: { log: jest.fn() },
  inp: {},
  fmtMoney: (n) => `${Number(n) || 0} €`,
  fmtDate: (d) => String(d || ''),
}))
jest.mock('../../components', () => ({ Badge: ({ text }) => <span>{text}</span> }))
jest.mock('../AIQontoV', () => () => null)
jest.mock('../../lib/crm', () => ({ quoteToOpportunite: jest.fn() }))
jest.mock('../../lib/crmDb', () => ({ upsertOpportunite: jest.fn() }))

// eslint-disable-next-line import/first
import QontoV from '../QontoV'

const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

beforeEach(() => {
  global.fetch = jest.fn((url, opts) => {
    if (url === '/api/qonto/token') return json({ ok: true, connected: true, login: 'id-maitrise' })
    const { endpoint } = JSON.parse(opts.body)
    if (endpoint.startsWith('client_invoices')) {
      return json({ client_invoices: [{ id: 'f1', number: 'F-001', status: 'paid', total_amount: { value: '100' } }] })
    }
    if (endpoint === 'quotes') return json({ quotes: [] })
    return json({ clients: [] })
  })
})

afterEach(() => { delete global.fetch })

describe('QontoV', () => {
  it('le champ de recherche garde le focus pendant la frappe', async () => {
    render(<QontoV m={false} data={{ chantiers: [] }} reload={jest.fn()} />)
    const input = await screen.findByPlaceholderText('Rechercher n° ou email…')
    await userEvent.type(input, 'F-00')
    const after = screen.getByPlaceholderText('Rechercher n° ou email…')
    expect(after).toBe(input)
    expect(after).toHaveFocus()
    expect(after).toHaveValue('F-00')
  })

  it('« Rafraîchir » et « Changer de compte » sont des boutons', async () => {
    render(<QontoV m={false} data={{ chantiers: [] }} reload={jest.fn()} />)
    const refresh = await screen.findByRole('button', { name: 'Rafraîchir' })
    expect(refresh).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Changer de compte' })).toBeInTheDocument()
    const calls = global.fetch.mock.calls.length
    await userEvent.click(refresh)
    expect(global.fetch.mock.calls.length).toBeGreaterThan(calls)
  })
})
