/**
 * @jest-environment node
 */
// Tests de la route /api/claude.
//
// Proxy Anthropic avec :
//   - rate limit 20 req/min par IP (anti-drain de quota)
//   - auth JWT Supabase obligatoire
//   - ANTHROPIC_API_KEY côté serveur (jamais exposée)
//   - propagation des erreurs Anthropic au client
//
// Le rate limit et le setInterval de cleanup sont au niveau module :
// on resetModules() entre chaque test pour repartir d'un état propre.

// eslint-disable-next-line import/first
// Placeholders — remplacés par loadRoute() dans chaque test.
let POST, verifyAuth, fetchWithRetry

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  jest.doMock('@/app/lib/logger', () => ({
    createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  }))
  // La route enregistre un setInterval au load pour nettoyer le cache de
  // rate-limit. Sous fake timers, setInterval() n'arme rien de vrai —
  // sans ça, Node garde l'event-loop vivant et jest --ci ne rend jamais
  // la main.
  POST = require('../route').POST
  verifyAuth = require('@/app/lib/auth').verifyAuth
  fetchWithRetry = require('@/app/lib/fetchWithRetry').fetchWithRetry
}

beforeAll(() => { jest.useFakeTimers() })
afterAll(() => { jest.useRealTimers() })

function makeRequest({ token, body, ip = '1.2.3.4' } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (ip) headers.set('x-forwarded-for', ip)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

function fakeOk(json) {
  return { ok: true, status: 200, json: async () => json, text: async () => '' }
}
function fakeErr(status, text = '') {
  return { ok: false, status, json: async () => ({}), text: async () => text }
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  loadRoute()
})

describe('POST /api/claude', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: { messages: [] } }))
    expect(res.status).toBe(401)
  })

  it('renvoie 500 si ANTHROPIC_API_KEY n\'est pas configurée', async () => {
    delete process.env.ANTHROPIC_API_KEY
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({ token: 't', body: { messages: [] } }))
    expect(res.status).toBe(500)
  })

  it("appelle Anthropic avec x-api-key, version header et le body", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const claudeReply = { id: 'msg_123', content: [{ text: 'Bonjour' }] }
    fetchWithRetry.mockResolvedValue(fakeOk(claudeReply))

    const res = await POST(makeRequest({
      token: 't',
      body: {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: 'Tu es utile.',
        messages: [{ role: 'user', content: 'Salut' }],
      },
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(claudeReply)

    const [url, init] = fetchWithRetry.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    // Le body doit contenir les params passés
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'Tu es utile.',
      messages: [{ role: 'user', content: 'Salut' }],
    })
  })

  it('utilise des defaults de modèle/max_tokens quand absents du body', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({}))

    await POST(makeRequest({ token: 't', body: {} }))
    const sent = JSON.parse(fetchWithRetry.mock.calls[0][1].body)
    expect(sent.model).toBe('claude-haiku-4-5-20251001')
    expect(sent.max_tokens).toBe(1000)
    expect(sent.messages).toEqual([])
  })

  it('propage le status code Anthropic en cas d\'erreur', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeErr(429, 'rate limit'))

    const res = await POST(makeRequest({ token: 't', body: { messages: [] } }))
    expect(res.status).toBe(429)
  })

  describe('rate limiting (20 req/min par IP)', () => {
    it('autorise 20 requêtes sur la même IP, 429 à la 21e', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeOk({}))

      for (let i = 0; i < 20; i++) {
        const res = await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.1' }))
        expect(res.status).toBe(200)
      }
      const blocked = await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.1' }))
      expect(blocked.status).toBe(429)
      expect((await blocked.json()).error).toMatch(/Trop de requêtes/)
    })

    it('comptabilise séparément par IP', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeOk({}))

      // 20 requêtes depuis l'IP A → toutes OK
      for (let i = 0; i < 20; i++) {
        await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.2' }))
      }
      // 1ère requête depuis l'IP B → doit passer (compteur indépendant)
      const res = await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.99' }))
      expect(res.status).toBe(200)
    })

    it('prend la première IP si x-forwarded-for contient une chaîne', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeOk({}))

      // 20 requêtes avec "10.0.0.3, 10.0.0.4" → bloquent l'IP 10.0.0.3
      for (let i = 0; i < 20; i++) {
        await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.3, 10.0.0.4' }))
      }
      const blocked = await POST(makeRequest({ token: 't', body: {}, ip: '10.0.0.3, 10.0.0.4' }))
      expect(blocked.status).toBe(429)
    })
  })
})
