/**
 * @jest-environment node
 */
let POST, verifyStaff, fetchWithRetry

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
  fetchWithRetry = require('@/app/lib/fetchWithRetry').fetchWithRetry
}

const req = (body, ip = '1.2.3.4') => ({
  headers: { get: (n) => (n.toLowerCase() === 'x-forwarded-for' ? ip : null) },
  json: async () => body,
})
const claude = (obj, extra = {}) => ({
  ok: true, status: 200, text: async () => '',
  json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }], ...extra }),
})

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'a@b.fr' }, status: 200 })
})

describe('/api/devis-ia', () => {
  it('401 / 403 selon verifyStaff', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 401 })
    expect((await POST(req({ action: 'generate', description: 'escalier' }))).status).toBe(401)
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    const r = await POST(req({ action: 'generate', description: 'escalier' }))
    expect(r.status).toBe(403)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('generate : appelle Claude avec schéma JSON et normalise les lignes', async () => {
    fetchWithRetry.mockResolvedValue(claude({
      objet: 'Escalier extérieur',
      lignes: [{ type: 'ligne', designation: 'Marches béton', unite: 'u', quantite: 6, prix_unitaire: 180.5, tva_taux: 10 }],
      conseils: ['Prévoir un garde-corps'],
    }))
    const res = await POST(req({ action: 'generate', description: 'Escalier 6 marches', context: { affaire: { titre: 'X' } } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({
      objet: 'Escalier extérieur',
      lignes: [{ type: 'ligne', designation: 'Marches béton', unite: 'u', quantite: '6', prix_unitaire: '180.5', tva_taux: '10' }],
      conseils: ['Prévoir un garde-corps'],
    })
    const [url, opts] = fetchWithRetry.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const sent = JSON.parse(opts.body)
    expect(sent.output_config.format.type).toBe('json_schema')
    expect(sent.fallbacks).toBe('default')
    expect(opts.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01')
    expect(sent.messages[0].content).toMatch(/Escalier 6 marches/)
  })

  it('generate : description trop courte → 400, refus → 422, aucune ligne → 422', async () => {
    expect((await POST(req({ action: 'generate', description: 'ab' }))).status).toBe(400)
    fetchWithRetry.mockResolvedValueOnce(claude({}, { stop_reason: 'refusal', content: [] }))
    expect((await POST(req({ action: 'generate', description: 'escalier' }))).status).toBe(422)
    fetchWithRetry.mockResolvedValueOnce(claude({ objet: 'x', lignes: [], conseils: [] }))
    expect((await POST(req({ action: 'generate', description: 'escalier' }))).status).toBe(422)
  })

  it('email : renvoie objet et corps', async () => {
    fetchWithRetry.mockResolvedValue(claude({ subject: 'Devis 26-050', body: 'Bonjour,\nci-joint…' }))
    const res = await POST(req({ action: 'email', devis: { numero: '26-050', total_ht: 100 }, signature: 'Dursun' }))
    expect(await res.json()).toEqual({ ok: true, data: { subject: 'Devis 26-050', body: 'Bonjour,\nci-joint…' } })
  })

  it('erreur Anthropic → 502, action inconnue → 400', async () => {
    fetchWithRetry.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    expect((await POST(req({ action: 'email', devis: {} }))).status).toBe(502)
    expect((await POST(req({ action: 'autre' }))).status).toBe(400)
  })
})
