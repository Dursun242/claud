/**
 * @jest-environment node
 */
// Tests de la route /api/pappers.
//
// Proxy Pappers avec 2 modes :
//   - lookup direct par SIRET → /v2/entreprise
//   - recherche par nom (q)   → /v2/recherche + /v2/recherche-dirigeants en parallèle
// Auth obligatoire, config API key côté serveur, fallback gracieux si
// la recherche dirigeants échoue.

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'

function makeRequest(url, { token } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    url,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
  }
}

function fakeFetchResponse({ ok = true, status = 200, json = null, text = '' } = {}) {
  return {
    ok, status,
    json: async () => json,
    text: async () => text,
  }
}

beforeEach(() => {
  process.env.PAPPERS_API_KEY = 'test-key'
  verifyAuth.mockReset()
  fetchWithRetry.mockReset()
})

describe('GET /api/pappers', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest('http://x/api/pappers?siret=12345678900012'))
    expect(res.status).toBe(401)
  })

  it('renvoie 500 si PAPPERS_API_KEY n\'est pas configurée', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    delete process.env.PAPPERS_API_KEY

    const res = await GET(makeRequest('http://x/api/pappers?siret=12345678900012'))
    expect(res.status).toBe(500)
  })

  it('renvoie 400 si ni siret ni q ne sont fournis', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await GET(makeRequest('http://x/api/pappers'))
    expect(res.status).toBe(400)
  })

  describe('lookup par SIRET', () => {
    it('proxy la réponse Pappers en cas de succès', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      const pappersPayload = { nom_entreprise: 'ID Maîtrise', siret: '12345678900012' }
      fetchWithRetry.mockResolvedValue(fakeFetchResponse({ json: pappersPayload }))

      const res = await GET(makeRequest('http://x/api/pappers?siret=12345678900012'))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(pappersPayload)

      // Vérifie que la clé API et le siret sont bien passés à Pappers
      const calledUrl = fetchWithRetry.mock.calls[0][0]
      expect(calledUrl).toContain('api_token=test-key')
      expect(calledUrl).toContain('siret=12345678900012')
      expect(calledUrl).toContain('api.pappers.fr/v2/entreprise')
    })

    it('propage le status code Pappers en cas d\'erreur (404 siret inconnu)', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeFetchResponse({ ok: false, status: 404, text: 'not found' }))

      const res = await GET(makeRequest('http://x/api/pappers?siret=99999999900000'))
      expect(res.status).toBe(404)
    })
  })

  describe('recherche par nom', () => {
    it('lance les 2 recherches en parallèle et renvoie { resultats, dirigeants }', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockImplementation(async (url) => {
        if (url.includes('recherche-dirigeants')) {
          return fakeFetchResponse({ json: { resultats: [{ nom: 'Dupont' }] } })
        }
        return fakeFetchResponse({ json: { resultats: [{ nom_entreprise: 'Dupont SARL' }] } })
      })

      const res = await GET(makeRequest('http://x/api/pappers?q=Dupont'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.resultats).toEqual([{ nom_entreprise: 'Dupont SARL' }])
      expect(json.dirigeants).toEqual([{ nom: 'Dupont' }])
      // 2 appels parallèles
      expect(fetchWithRetry).toHaveBeenCalledTimes(2)
    })

    it("continue si recherche-dirigeants échoue (dégradation gracieuse)", async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockImplementation(async (url) => {
        if (url.includes('recherche-dirigeants')) {
          return fakeFetchResponse({ ok: false, status: 403, text: 'quota' })
        }
        return fakeFetchResponse({ json: { resultats: [{ nom_entreprise: 'A' }] } })
      })

      const res = await GET(makeRequest('http://x/api/pappers?q=A'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.resultats).toHaveLength(1)
      expect(json.dirigeants).toEqual([])
    })

    it("renvoie 502 si les DEUX recherches échouent", async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeFetchResponse({ ok: false, status: 500, text: 'boom' }))

      const res = await GET(makeRequest('http://x/api/pappers?q=Dupont'))
      expect(res.status).toBe(502)
    })

    it("limite à 6 résultats par recherche (par_page=6)", async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockResolvedValue(fakeFetchResponse({ json: { resultats: [] } }))

      await GET(makeRequest('http://x/api/pappers?q=X'))

      for (const call of fetchWithRetry.mock.calls) {
        expect(call[0]).toContain('par_page=6')
      }
    })

    it('survit à une erreur réseau (Promise rejetée) sur une des 2 recherches', async () => {
      verifyAuth.mockResolvedValue({ id: 'u1' })
      fetchWithRetry.mockImplementation(async (url) => {
        if (url.includes('recherche-dirigeants')) {
          throw new Error('ECONNRESET')
        }
        return fakeFetchResponse({ json: { resultats: [{ nom_entreprise: 'OK' }] } })
      })

      const res = await GET(makeRequest('http://x/api/pappers?q=OK'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.resultats).toHaveLength(1)
      expect(json.dirigeants).toEqual([])
    })
  })
})
