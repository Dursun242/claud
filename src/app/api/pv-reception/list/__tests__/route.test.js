/**
 * @jest-environment node
 */
// Tests de la route /api/pv-reception/list.
//
// On utilise l'environnement node (et pas jsdom) : les routes App Router
// dépendent des globals WHATWG (Response, Request, fetch) qui existent
// nativement dans Node 18+ mais que jsdom masque. Switcher par fichier
// évite un polyfill global fragile.
//
// Stratégie : on mocke les deps externes (verifyAuth, supabaseClients) et
// on exerce le handler GET directement comme une fonction. Next.js n'a pas
// besoin de tourner — on valide seulement la logique de la route (auth,
// validation des query params, pagination, code de retour).

jest.mock('@/app/lib/auth', () => ({
  verifyAuth: jest.fn(),
}))

// Le module supabaseClients expose 3 helpers : on mocke extractBearerToken
// et userClientFromToken (le 3e, adminClient, n'est pas utilisé ici).
jest.mock('@/app/lib/supabaseClients', () => ({
  userClientFromToken: jest.fn(),
  extractBearerToken: jest.fn(),
  adminClient: jest.fn(),
}))

jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { userClientFromToken, extractBearerToken } from '@/app/lib/supabaseClients'

// Helper : fabrique une Request factice avec l'URL + l'Authorization.
function makeRequest(url, { token } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    url,
    headers: {
      get: (name) => headers.get(name.toLowerCase()) ?? null,
    },
  }
}

// Helper : fabrique un mock du client Supabase exposant la chaîne
// .from().select().eq().order().range() utilisée par la route.
function makeSupaStub({ data = [], error = null, count = 0 } = {}) {
  const result = Promise.resolve({ data, error, count })
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    // .range() est le dernier maillon : il renvoie la Promise.
    range: jest.fn().mockReturnValue(result),
  }
  return chain
}

beforeEach(() => {
  verifyAuth.mockReset()
  userClientFromToken.mockReset()
  extractBearerToken.mockReset()
})

describe('GET /api/pv-reception/list', () => {
  it('renvoie 401 si verifyAuth échoue', async () => {
    verifyAuth.mockResolvedValue(null)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=abc'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/Non autorisé/)
  })

  it('renvoie 400 si chantierId est absent', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const res = await GET(makeRequest('http://x/api/pv-reception/list', { token: 't' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/chantierId/)
  })

  it('renvoie 401 si le token est manquant dans le header', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue(null)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=abc'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/Token manquant/)
  })

  it('renvoie la liste paginée avec les defaults (limit=50, offset=0)', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const fakeData = [{ id: 1 }, { id: 2 }]
    const supa = makeSupaStub({ data: fakeData, count: 2 })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=abc-123', { token: 'tok' }))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.count).toBe(2)
    expect(json.data).toEqual(fakeData)
    expect(json.limit).toBe(50)
    expect(json.offset).toBe(0)
    expect(json.hasMore).toBe(false)

    // Vérifie que le filtre par chantier est bien passé à Supabase
    expect(supa.eq).toHaveBeenCalledWith('chantier_id', 'abc-123')
    // Et que la pagination Supabase (range) a reçu offset..offset+limit-1
    expect(supa.range).toHaveBeenCalledWith(0, 49)
  })

  it("respecte les bornes de pagination (limit>200 est ramené à 200)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ data: [], count: 0 })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=c1&limit=999&offset=10', { token: 'tok' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.limit).toBe(200) // bornage à MAX_LIMIT
    expect(json.offset).toBe(10)
    // range(10, 209) : offset=10, limit=200 → 10..10+200-1 = 10..209
    expect(supa.range).toHaveBeenCalledWith(10, 209)
  })

  it('hasMore=true quand le count total dépasse offset+data.length', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ data: [{ id: 1 }, { id: 2 }], count: 120 })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=c1&limit=2', { token: 'tok' }))
    const json = await res.json()
    expect(json.hasMore).toBe(true)
    expect(json.count).toBe(120)
  })

  it('renvoie 500 si la requête Supabase échoue', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    extractBearerToken.mockReturnValue('tok')
    const supa = makeSupaStub({ error: { message: 'DB down' } })
    userClientFromToken.mockReturnValue(supa)

    const res = await GET(makeRequest('http://x/api/pv-reception/list?chantierId=c1', { token: 'tok' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/Erreur/)
  })
})
