/**
 * @jest-environment node
 */
// Tests de la route /api/qonto.
//
// Proxy lecture seule vers l'API Qonto v2. Le token Qonto est stocké en DB
// (pas passé dans le body) — la route le récupère via adminClient. Couvre :
//   - Auth JWT Supabase
//   - Whitelist des endpoints (anti-proxy arbitraire)
//   - Cache court (5s) du token
//   - Invalidation cache sur 401 Qonto

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// Le module met en cache le token à l'échelle du module → chaque test
// doit réinitialiser l'état avec jest.resetModules() pour repartir propre.
let POST, verifyAuth, fetchWithRetry, adminClient

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
  jest.doMock('@/app/lib/logger', () => ({
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  }))
  POST = require('../route').POST
  verifyAuth = require('@/app/lib/auth').verifyAuth
  fetchWithRetry = require('@/app/lib/fetchWithRetry').fetchWithRetry
  adminClient = require('@/app/lib/supabaseClients').adminClient
}

function makeRequest({ token, body } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

function supaWithToken(tokenValue) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: tokenValue ? { value: tokenValue } : null,
        error: null,
      }),
    }),
  }
}

function fakeOk(json) {
  return { ok: true, status: 200, json: async () => json, text: async () => '' }
}
function fakeErr(status, text = '') {
  return { ok: false, status, json: async () => ({}), text: async () => text }
}

beforeEach(() => { loadRoute() })

describe('POST /api/qonto', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: { endpoint: 'clients' } }))
    expect(res.status).toBe(401)
  })

  it('renvoie 400 si endpoint manquant', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({ token: 't', body: {} }))
    expect(res.status).toBe(400)
  })

  it('renvoie 403 pour un endpoint non whitelisté', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({ token: 't', body: { endpoint: 'memberships' } }))
    expect(res.status).toBe(403)
  })

  it("renvoie 400 si le token Qonto n'est pas configuré en DB", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    adminClient.mockReturnValue(supaWithToken(null))

    const res = await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Token Qonto/)
  })

  it('proxy la réponse Qonto et envoie le token en header Authorization', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    adminClient.mockReturnValue(supaWithToken('login:secret-123'))
    fetchWithRetry.mockResolvedValue(fakeOk({ clients: [{ id: 'c1' }] }))

    const res = await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ clients: [{ id: 'c1' }] })

    const [url, init] = fetchWithRetry.mock.calls[0]
    expect(url).toBe('https://thirdparty.qonto.com/v2/clients')
    // Qonto attend "login:secret" direct, SANS prefix "Bearer "
    expect(init.headers.Authorization).toBe('login:secret-123')
  })

  it('accepte des endpoints avec query string (client_invoices?exclude_imports=false)', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    adminClient.mockReturnValue(supaWithToken('login:s'))
    fetchWithRetry.mockResolvedValue(fakeOk({ client_invoices: [] }))

    const res = await POST(makeRequest({
      token: 't',
      body: { endpoint: 'client_invoices?exclude_imports=false' },
    }))
    expect(res.status).toBe(200)
    expect(fetchWithRetry.mock.calls[0][0])
      .toBe('https://thirdparty.qonto.com/v2/client_invoices?exclude_imports=false')
  })

  it('propage le status code Qonto en cas d\'erreur', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    adminClient.mockReturnValue(supaWithToken('login:s'))
    fetchWithRetry.mockResolvedValue(fakeErr(429, 'rate limited'))

    const res = await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    expect(res.status).toBe(429)
  })

  it('met en cache le token sur 2 appels rapprochés (1 seul SELECT Supabase)', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const supa = supaWithToken('login:cached')
    adminClient.mockReturnValue(supa)
    fetchWithRetry.mockResolvedValue(fakeOk({}))

    await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    await POST(makeRequest({ token: 't', body: { endpoint: 'quotes' } }))

    // adminClient() est appelé 1 seule fois (cache hit au 2e appel).
    expect(adminClient).toHaveBeenCalledTimes(1)
  })

  it('invalide le cache sur 401 Qonto (token révoqué) → refait un SELECT au prochain appel', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const supa = supaWithToken('login:old')
    adminClient.mockReturnValue(supa)
    fetchWithRetry.mockResolvedValueOnce(fakeErr(401, 'unauth'))

    const res1 = await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    expect(res1.status).toBe(401)

    // 2e appel : le cache doit être invalidé → adminClient() rappelé
    fetchWithRetry.mockResolvedValueOnce(fakeOk({}))
    await POST(makeRequest({ token: 't', body: { endpoint: 'clients' } }))
    expect(adminClient).toHaveBeenCalledTimes(2)
  })
})
