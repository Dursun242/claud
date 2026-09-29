/**
 * @jest-environment node
 */
// Tests de /api/odoo/signed-pdf : le PDF n'est servi que si le requestId
// correspond à un PV ou un OS visible par l'appelant (lecture sous RLS).

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/odoo', () => ({ getCompletedDocument: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({
  userClientFromToken: jest.fn(),
  extractBearerToken: jest.fn(() => 'jwt'),
}))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { getCompletedDocument } from '@/app/lib/odoo'
// eslint-disable-next-line import/first
import { userClientFromToken } from '@/app/lib/supabaseClients'

function makeRequest(requestId) {
  return {
    url: `http://localhost/api/odoo/signed-pdf?requestId=${requestId}`,
    headers: { get: () => 'Bearer jwt' },
  }
}

// .from(table).select().eq().limit() → { data } selon la table
function userStub({ pv = [], os = [] } = {}) {
  return {
    from: jest.fn((table) => ({
      select: () => ({
        eq: () => ({ limit: async () => ({ data: table === 'ordres_service' ? os : pv, error: null }) }),
      }),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyAuth.mockResolvedValue({ id: 'u1' })
})

describe('GET /api/odoo/signed-pdf', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    expect((await GET(makeRequest(12))).status).toBe(401)
  })

  it('renvoie 400 si requestId invalide', async () => {
    expect((await GET(makeRequest('abc'))).status).toBe(400)
  })

  it('renvoie 404 sans interroger Odoo si aucun PV/OS visible ne porte ce requestId', async () => {
    userClientFromToken.mockReturnValue(userStub())
    const res = await GET(makeRequest(12))
    expect(res.status).toBe(404)
    expect(getCompletedDocument).not.toHaveBeenCalled()
  })

  it('sert le PDF quand le requestId correspond à un OS visible', async () => {
    userClientFromToken.mockReturnValue(userStub({ os: [{ id: 'os1' }] }))
    getCompletedDocument.mockResolvedValue({ base64: Buffer.from('%PDF').toString('base64'), filename: 'OS 12.pdf' })
    const res = await GET(makeRequest(12))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="OS_12.pdf"')
    expect(getCompletedDocument).toHaveBeenCalledWith(12)
  })
})
