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
  json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }], ...extra }),
})
const REPONSE = {
  lots: [{ nom: 'Gros œuvre', postes: [{ designation: 'Fondations', quantite: 1, unite: 'ens', pu_ht: 12000 }] }, { nom: 'Vide', postes: [] }],
  surface_m2: 110.4, hypotheses: ['Sol porteur'], conseils: ['Étude de sol G2'],
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'a@b.fr' }, status: 200 })
})

describe('/api/chiffrage/ia', () => {
  it('401 / 403 selon verifyStaff', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req({ action: 'generer', description: 'maison de 110 m²' }))).status).toBe(403)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('generer : contexte (lots du chantier, prix société) envoyé, lots normalisés', async () => {
    fetchWithRetry.mockResolvedValue(claude(REPONSE))
    const res = await POST(req({ action: 'generer', description: 'Maison plain-pied 110 m², 3 chambres', lots: ['Gros œuvre'], refs: [{ designation: 'Dalle', pu_ht: 60 }] }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.lots).toHaveLength(2)
    expect(data.lots[0].postes[0]).toMatchObject({ designation: 'Fondations', quantite: 1, pu_ht: 12000 })
    expect(data).toMatchObject({ surface_m2: 110, hypotheses: ['Sol porteur'], conseils: ['Étude de sol G2'] })
    const sent = JSON.parse(fetchWithRetry.mock.calls[0][1].body)
    expect(sent.output_config.format.type).toBe('json_schema')
    expect(sent.messages[0].content).toMatch(/lots_chantier.*Gros œuvre/)
    expect(sent.messages[0].content).toMatch(/Dalle/)
  })

  it('importer : texte collé remis en forme', async () => {
    fetchWithRetry.mockResolvedValue(claude(REPONSE))
    const res = await POST(req({ action: 'importer', texte: 'Lot 1 Gros œuvre\tFondations\t12 000 €' }))
    expect(res.status).toBe(200)
    expect(JSON.parse(fetchWithRetry.mock.calls[0][1].body).system).toMatch(/N'invente aucun prix/)
  })

  it('entrées trop courtes → 400, aucun poste → 422, action inconnue → 400', async () => {
    expect((await POST(req({ action: 'generer', description: 'maison' }))).status).toBe(400)
    expect((await POST(req({ action: 'importer', texte: '' }))).status).toBe(400)
    fetchWithRetry.mockResolvedValueOnce(claude({ lots: [], surface_m2: 0, hypotheses: [], conseils: [] }))
    expect((await POST(req({ action: 'generer', description: 'Maison plain-pied 110 m²' }))).status).toBe(422)
    expect((await POST(req({ action: 'x' }))).status).toBe(400)
  })
})
