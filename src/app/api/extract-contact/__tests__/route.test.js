/**
 * @jest-environment node
 */
// Tests de la route /api/extract-contact.
//
// Route : rate limit (10/min/IP) → auth → validation image (mediaType,
// taille ≤5Mo) → appel Claude Vision → parse JSON réponse → renvoie {data}.

// Le module installe un setInterval au chargement (cleanup du rate-limit).
// On resetModules() entre chaque test pour repartir propre + fake timers.
let POST, verifyAuth, fetchWithRetry

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  POST = require('../route').POST
  verifyAuth = require('@/app/lib/auth').verifyAuth
  fetchWithRetry = require('@/app/lib/fetchWithRetry').fetchWithRetry
}

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

beforeAll(() => { jest.useFakeTimers() })
afterAll(() => { jest.useRealTimers() })

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  loadRoute()
  // Silence les console.error des branches d'erreur (intentionnelles).
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { console.error.mockRestore?.() })

describe('POST /api/extract-contact', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({
      body: { imageBase64: 'xxx', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(401)
  })

  it('renvoie 500 si ANTHROPIC_API_KEY absente (message générique)', async () => {
    delete process.env.ANTHROPIC_API_KEY
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'xxx', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    // Le message ne doit PAS leak le nom de l'env var
    expect((await res.json()).error).not.toMatch(/ANTHROPIC/i)
  })

  it("renvoie 400 si imageBase64 manque ou n'est pas une string", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const r1 = await POST(makeRequest({ token: 't', body: { mediaType: 'image/jpeg' } }))
    expect(r1.status).toBe(400)

    const r2 = await POST(makeRequest({ token: 't', body: { imageBase64: '', mediaType: 'image/jpeg' } }))
    expect(r2.status).toBe(400)

    const r3 = await POST(makeRequest({ token: 't', body: { imageBase64: 123, mediaType: 'image/jpeg' } }))
    expect(r3.status).toBe(400)
  })

  it("refuse un mediaType non whitelisté", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'xxx', mediaType: 'image/tiff' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Format/i)
  })

  it("refuse une image > 5 Mo", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    // 5 Mo base64 ≈ 5*1024*1024/0.75 = ~7 Mo en caractères
    const big = 'x'.repeat(8 * 1024 * 1024)
    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: big, mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/volumineuse/i)
  })

  it("parse JSON strict renvoyé par Claude et renvoie {ok, data}", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const extracted = {
      nom: 'Jean Dupont', societe: 'Dupont SARL',
      type: 'Artisan', specialite: 'Plomberie',
      tel: '06 12 34 56 78',
    }
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: JSON.stringify(extracted) }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data).toEqual(extracted)
  })

  it("nettoie les backticks markdown avant de parser le JSON", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: '```json\n{"nom":"X"}\n```' }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ nom: 'X' })
  })

  it("renvoie 500 si le JSON retourné par Claude est invalide", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: 'ce n\'est pas du json' }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/JSON valide|plus nette/i)
  })

  it("renvoie 500 si la réponse Claude est vide", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '' }] }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/vide/i)
  })

  it("propage le status code Anthropic en cas d'erreur", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeErr(529, 'overloaded'))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(529)
  })

  it("rate limit : 429 après 10 requêtes sur la même IP", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '{}' }] }))

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest({
        token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' }, ip: '10.0.0.1',
      }))
      expect(res.status).toBe(200)
    }
    const blocked = await POST(makeRequest({
      token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' }, ip: '10.0.0.1',
    }))
    expect(blocked.status).toBe(429)
  })

  it("refuse un JSON array (type attendu : object)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '[1, 2, 3]' }] }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/inattendu/i)
  })

  it("accepte un objet vide {} (cas où Claude ne détecte rien)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '{}' }] }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({})
  })
})
