/**
 * @jest-environment node
 */
let POST, verifyStaff, fetchWithRetry

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  jest.doMock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => { throw new Error('pas de base') } }))
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
const mistral = (obj) => ({
  ok: true, status: 200, text: async () => '',
  json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }] }),
})
const sent = (i = 0) => JSON.parse(fetchWithRetry.mock.calls[i][1].body)
const TRAME = {
  surface_m2: 110.4,
  lots: [{ nom: 'GROS ŒUVRE, MAÇONNERIE', contenu: 'Fondations, murs, planchers' }, { nom: 'PEINTURE', contenu: 'Murs et plafonds' }, { nom: '', contenu: 'x' }],
  metre_cle: [{ element: 'Murs à peindre', quantite: 300, unite: 'm²' }],
  hypotheses: ['Sol porteur'], non_compris: ['Piscine'], conseils: [],
}
const LOT = { postes: [{ designation: 'Murs, impression + 2 couches', quantite: 300, unite: 'm²', pu_ht: 12 }] }

const ENV = { ...process.env }
beforeEach(() => {
  process.env = { ...ENV, ANTHROPIC_API_KEY: 'sk-ant-test', MISTRAL_API_KEY: 'sk-mis' }
  delete process.env.CHIFFRAGE_AI_PROVIDER
  delete process.env.CHIFFRAGE_MISTRAL_MODEL
  delete process.env.AI_PROVIDER
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'a@b.fr' }, status: 200 })
})
afterAll(() => { process.env = ENV })

describe('/api/chiffrage/ia', () => {
  it('401 / 403 selon verifyStaff', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req({ action: 'trame', description: 'maison de 110 m²' }))).status).toBe(403)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('trame : Mistral Large par défaut, lots nettoyés, métré clé, hypothèses', async () => {
    fetchWithRetry.mockResolvedValue(mistral(TRAME))
    const res = await POST(req({ action: 'trame', description: 'Maison plain-pied 110 m², 3 chambres', lots: ['Gros œuvre'] }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toEqual({
      lots: [{ nom: 'GROS ŒUVRE, MAÇONNERIE', contenu: 'Fondations, murs, planchers' }, { nom: 'PEINTURE', contenu: 'Murs et plafonds' }],
      metre_cle: [{ element: 'Murs à peindre', quantite: 300, unite: 'm²', source: '' }],
      surface_m2: 110, hypotheses: ['Sol porteur'], non_compris: ['Piscine'], conseils: [], ia: 'mistral',
    })
    expect(fetchWithRetry.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/chat/completions')
    expect(sent().model).toBe('mistral-large-latest')
    expect(sent().response_format.type).toBe('json_schema')
    expect(sent().messages[1].content).toMatch(/lots_chantier.*Gros œuvre/)
  })

  it('lot : contexte (métré clé, autres lots, prix société, barème) et postes normalisés', async () => {
    process.env.CHIFFRAGE_MISTRAL_MODEL = 'mistral-medium-latest'
    fetchWithRetry.mockResolvedValue(mistral(LOT))
    const res = await POST(req({
      action: 'lot', description: 'Maison plain-pied 110 m²', lot: TRAME.lots[1], autres_lots: [TRAME.lots[0]],
      metre_cle: TRAME.metre_cle, refs: [{ designation: 'Peinture murs', unite: 'm²', pu_ht: 13, nb: 4 }],
    }))
    const { data } = await res.json()
    expect(data.postes[0]).toMatchObject({ designation: 'Murs, impression + 2 couches', quantite: 300, unite: 'm²', pu_ht: 12 })
    expect(data.ia).toBe('mistral')
    expect(sent().model).toBe('mistral-medium-latest')
    const user = sent().messages[1].content
    expect(user).toMatch(/"lot":\{"nom":"PEINTURE"/)
    expect(user).toMatch(/autres_lots.*GROS ŒUVRE/)
    expect(user).toMatch(/Peinture murs/)
    expect(user).toMatch(/bareme_id_maitrise/)
    expect(user).toMatch(/Chiffre le lot « PEINTURE »/)
  })

  it('Mistral indisponible → Claude en secours ; sans clé Mistral → Claude directement ; réglage anthropic', async () => {
    fetchWithRetry.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'overloaded' }).mockResolvedValueOnce(claude(LOT))
    let { data } = await (await POST(req({ action: 'lot', description: 'Maison plain-pied 110 m²', lot: TRAME.lots[1] }))).json()
    expect(data.ia).toBe('anthropic')
    expect(fetchWithRetry.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages')

    fetchWithRetry.mockReset()
    delete process.env.MISTRAL_API_KEY
    fetchWithRetry.mockResolvedValue(claude(LOT))
    ;({ data } = await (await POST(req({ action: 'lot', description: 'Maison plain-pied 110 m²', lot: TRAME.lots[1] }, '5.5.5.5'))).json())
    expect(data.ia).toBe('anthropic')
    expect(fetchWithRetry).toHaveBeenCalledTimes(1)

    fetchWithRetry.mockReset()
    process.env.MISTRAL_API_KEY = 'sk-mis'
    process.env.CHIFFRAGE_AI_PROVIDER = 'anthropic'
    fetchWithRetry.mockResolvedValue(claude(LOT))
    await POST(req({ action: 'lot', description: 'Maison plain-pied 110 m²', lot: TRAME.lots[1] }, '6.6.6.6'))
    expect(fetchWithRetry.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
  })

  it('importer (texte) : modèle rapide par défaut (Claude), sans invention de prix', async () => {
    fetchWithRetry.mockResolvedValue(claude({ lots: [{ nom: 'GO', postes: [{ designation: 'Fondations', quantite: 1, unite: 'Ft', pu_ht: 12000 }] }], surface_m2: 0, hypotheses: [], non_compris: [], conseils: [] }))
    const res = await POST(req({ action: 'importer', texte: 'Lot 1 Gros œuvre\tFondations\t12 000 €' }))
    expect(res.status).toBe(200)
    expect(fetchWithRetry.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(sent().system).toMatch(/N'invente aucun prix/)
  })

  it('entrées invalides → 400, aucun lot / poste → 422, action inconnue → 400', async () => {
    expect((await POST(req({ action: 'trame', description: 'maison' }))).status).toBe(400)
    expect((await POST(req({ action: 'lot', description: 'Maison plain-pied 110 m²', lot: {} }))).status).toBe(400)
    expect((await POST(req({ action: 'importer', texte: '' }))).status).toBe(400)
    fetchWithRetry.mockResolvedValueOnce(mistral({ ...TRAME, lots: [] }))
    expect((await POST(req({ action: 'trame', description: 'Maison plain-pied 110 m²' }))).status).toBe(422)
    fetchWithRetry.mockResolvedValueOnce(mistral({ postes: [] }))
    expect((await POST(req({ action: 'lot', description: 'Maison plain-pied 110 m²', lot: TRAME.lots[0] }))).status).toBe(422)
    expect((await POST(req({ action: 'generer', description: 'Maison plain-pied 110 m²' }))).status).toBe(400)
  })
})
