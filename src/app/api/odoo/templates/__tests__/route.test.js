/**
 * @jest-environment node
 */
// Tests de la route /api/odoo/templates.
//
// GET  → liste les templates Odoo Sign (staff uniquement)
// HEAD → ping de connexion (diagnostic, staff uniquement)

jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('../../../../lib/odoo', () => ({
  getSignTemplates: jest.fn(),
  testConnection: jest.fn(),
}))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}))

// eslint-disable-next-line import/first
import { GET, HEAD } from '../route'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { getSignTemplates, testConnection } from '../../../../lib/odoo'

function makeRequest({ token } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return { headers: { get: (n) => headers.get(n.toLowerCase()) ?? null } }
}

beforeEach(() => {
  verifyStaff.mockReset()
  verifyStaff.mockResolvedValue({ user: { id: 'u1' }, status: 200 })
  getSignTemplates.mockReset()
  testConnection.mockReset()
})

describe('GET /api/odoo/templates', () => {
  it('renvoie 401 sans auth', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 401 })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('renvoie 403 pour un client (MOA)', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(403)
    expect(getSignTemplates).not.toHaveBeenCalled()
  })

  it('renvoie les templates', async () => {
    const templates = [{ id: 1, name: 'Tpl A' }, { id: 2, name: 'Tpl B' }]
    getSignTemplates.mockResolvedValue(templates)

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ templates })
  })

  it('renvoie 500 avec un message générique si getSignTemplates jette', async () => {
    getSignTemplates.mockRejectedValue(new Error('Odoo down at https://odoo.interne'))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur Odoo' })
  })
})

describe('HEAD /api/odoo/templates', () => {
  it('renvoie 401 sans auth', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 401 })
    const res = await HEAD(makeRequest())
    expect(res.status).toBe(401)
    expect(testConnection).not.toHaveBeenCalled()
  })

  it('renvoie les infos de connexion quand Odoo répond', async () => {
    testConnection.mockResolvedValue({ ok: true, version: '18.0', uid: 42 })

    const res = await HEAD(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, version: '18.0', uid: 42 })
  })

  it('renvoie 500 si testConnection jette', async () => {
    testConnection.mockRejectedValue(new Error('unreachable'))

    const res = await HEAD(makeRequest())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur Odoo' })
  })
})
