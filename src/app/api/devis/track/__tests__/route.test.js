/**
 * @jest-environment node
 */
let GET, inserts, devisByToken

const TOKEN = 'e'.repeat(64)

beforeEach(() => {
  jest.resetModules()
  inserts = []
  devisByToken = { [TOKEN]: { id: 'd1' } }
  jest.doMock('@/app/lib/supabaseClients', () => ({
    adminClient: () => ({ from: (table) => {
      const q = {}
      const b = {
        select: () => b, gte: () => b,
        eq: (k, v) => { q[k] = v; return b },
        maybeSingle: async () => ({ data: devisByToken[q.track_token] || null, error: null }),
        limit: async () => ({ data: [] }),
        insert: async (row) => { inserts.push({ table, row }); return { error: null } },
      }
      return b
    } }),
  }))
  ;({ GET } = require('../route'))
})

const req = (t) => ({
  url: `https://app.test/api/devis/track?t=${t}`,
  headers: { get: (h) => ({ 'x-forwarded-for': '66.249.1.1', 'user-agent': 'GoogleImageProxy' })[h] || null },
})

describe('/api/devis/track', () => {
  it('jeton connu : ouverture enregistrée, image GIF non mise en cache', async () => {
    const res = await GET(req(TOKEN))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/gif')
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/)
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 3).toString()).toBe('GIF')
    expect(inserts).toEqual([{ table: 'crm_devis_events', row: { devis_id: 'd1', kind: 'ouverture', ip: '66.249.1.1', user_agent: 'GoogleImageProxy' } }])
  })

  it('jeton inconnu ou invalide : image quand même, rien enregistré', async () => {
    expect((await GET(req('f'.repeat(64)))).status).toBe(200)
    expect((await GET(req('pas-un-jeton'))).status).toBe(200)
    expect(inserts).toHaveLength(0)
  })
})
