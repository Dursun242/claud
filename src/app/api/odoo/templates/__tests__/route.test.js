/**
 * @jest-environment node
 */
// Tests de la route /api/odoo/templates.
//
// GET  → liste les templates Odoo Sign + inspecte les champs sign.template
// HEAD → ping de connexion (diagnostic)

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('../../../../lib/odoo', () => ({
  getSignTemplates: jest.fn(),
  testConnection: jest.fn(),
  inspectModel: jest.fn(),
}))

// eslint-disable-next-line import/first
import { GET, HEAD } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { getSignTemplates, testConnection, inspectModel } from '../../../../lib/odoo'

function makeRequest({ token } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return { headers: { get: (n) => headers.get(n.toLowerCase()) ?? null } }
}

beforeEach(() => {
  verifyAuth.mockReset()
  getSignTemplates.mockReset()
  testConnection.mockReset()
  inspectModel.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  console.error.mockRestore?.()
})

describe('GET /api/odoo/templates', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('renvoie les templates + les champs de sign.template (diagnostic)', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const templates = [{ id: 1, name: 'Tpl A' }, { id: 2, name: 'Tpl B' }]
    getSignTemplates.mockResolvedValue(templates)
    inspectModel.mockResolvedValue({ name: { type: 'char' }, active: { type: 'boolean' } })

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.templates).toEqual(templates)
    expect(json._signTemplateFields).toEqual(['name', 'active'])
  })

  it('renvoie 500 (message générique) si getSignTemplates jette', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    getSignTemplates.mockRejectedValue(new Error('Odoo down'))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur serveur' })
  })
})

describe('HEAD /api/odoo/templates', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await HEAD(makeRequest())
    expect(res.status).toBe(401)
  })

  it('renvoie les infos de connexion quand Odoo répond', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    testConnection.mockResolvedValue({ ok: true, version: '18.0', uid: 42 })

    const res = await HEAD(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, version: '18.0', uid: 42 })
  })

  it('renvoie 500 (message générique) si testConnection jette', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    testConnection.mockRejectedValue(new Error('unreachable'))

    const res = await HEAD(makeRequest({ token: 't' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur connexion Odoo' })
  })
})
