/**
 * @jest-environment node
 */
// Tests de la route /api/extract-os-data.
//
// Extraction de données de devis (OS) par Claude Vision. Même pattern que
// extract-contact (rate limit, auth, validation image, appel Claude, parse
// JSON) + normalisation des prestations.

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

beforeAll(() => { jest.useFakeTimers() })
afterAll(() => { jest.useRealTimers() })

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  loadRoute()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { console.error.mockRestore?.() })

describe('POST /api/extract-os-data', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({
      body: { imageBase64: 'xxx', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(401)
  })

  it("renvoie 400 sur image manquante ou mediaType non whitelisté", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const r1 = await POST(makeRequest({ token: 't', body: { mediaType: 'image/jpeg' } }))
    expect(r1.status).toBe(400)

    const r2 = await POST(makeRequest({ token: 't', body: { imageBase64: 'x', mediaType: 'image/bmp' } }))
    expect(r2.status).toBe(400)
  })

  it('message d\'erreur générique sur ANTHROPIC_API_KEY manquant', async () => {
    delete process.env.ANTHROPIC_API_KEY
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/ANTHROPIC/i)
  })

  it("appelle Claude Haiku 4.5 avec max_tokens 2048", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '{}' }] }))

    await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/png' },
    }))

    const [, init] = fetchWithRetry.mock.calls[0]
    const sent = JSON.parse(init.body)
    expect(sent.model).toBe('claude-haiku-4-5-20251001')
    // max_tokens spécifique devis (plus haut que extract-contact)
    expect(sent.max_tokens).toBe(2048)
    // Image passée en base64 avec le bon media_type
    expect(sent.messages[0].content[0].source).toEqual({
      type: 'base64', media_type: 'image/png', data: 'JVBERi',
    })
  })

  it("normalise les prestations (types numériques, défauts)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: JSON.stringify({
        artisan_nom: 'Plombier X',
        prestations: [
          { description: 'Tuyau',   quantite: '2',   prix_unitaire: '50.5', tva_taux: '20' },
          { description: 'Raccord', quantite: 3,     prix_unitaire: 10,     tva_taux: 5.5 },
          { description: '',        quantite: 999,   prix_unitaire: 999 },  // jeté (pas de desc)
          { description: 'Minimal' },                                        // défauts
          'invalid-entry',                                                    // jeté (pas object)
        ],
      }) }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    const { data } = await res.json()

    expect(data.prestations).toEqual([
      { description: 'Tuyau',   unite: 'u', quantite: 2, prix_unitaire: 50.5, tva_taux: 20 },
      { description: 'Raccord', unite: 'u', quantite: 3, prix_unitaire: 10,   tva_taux: 5.5 },
      // 'description' vide → ligne filtrée
      // Minimal : défauts quantite 0 / prix 0 / tva 20 (default)
      { description: 'Minimal', unite: 'u', quantite: 0, prix_unitaire: 0, tva_taux: 20 },
      // 'invalid-entry' string → filtré
    ])
  })

  it("renvoie prestations:[] si le JSON ne contient pas de prestations", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: JSON.stringify({ artisan_nom: 'X' }) }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.prestations).toEqual([])
  })

  it('renvoie 500 si Claude renvoie du JSON invalide', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: 'nope' }] }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/JSON valide|plus nette/i)
  })

  it("nettoie les backticks markdown avant parse", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({
      content: [{ text: '```json\n{"artisan_nom": "X", "prestations": []}\n```' }],
    }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'JVBERi', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.artisan_nom).toBe('X')
  })

  it("rate limit 10/min/IP : 11e requête → 429", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '{}' }] }))

    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest({
        token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' }, ip: '9.9.9.9',
      }))
      expect(res.status).toBe(200)
    }
    const blocked = await POST(makeRequest({
      token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' }, ip: '9.9.9.9',
    }))
    expect(blocked.status).toBe(429)
  })

  it("refuse un JSON array (type attendu : object)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fakeOk({ content: [{ text: '[1, 2]' }] }))

    const res = await POST(makeRequest({
      token: 't', body: { imageBase64: 'x', mediaType: 'image/jpeg' },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/inattendu/i)
  })
})
