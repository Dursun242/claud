/**
 * @jest-environment node
 */
let POST, verifyStaff, generate

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/ai', () => ({
    ...jest.requireActual('@/app/lib/ai'),
    generate: jest.fn(),
    providerOrder: () => ['anthropic'],
  }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
  generate = require('@/app/lib/ai').generate
}

let ipSeq = 0
const req = (body) => {
  const ip = `10.1.0.${++ipSeq}`
  return { headers: { get: () => ip }, json: async () => body }
}
const context = {
  lots: [{ lot: 'Électricité', entreprise: 'Martin Élec' }],
  points: [{ id: 't1', num: 1, lot: 'Électricité', titre: 'Poser le tableau', etat: 'relance' }],
}
const valid = { notes: 'Électricité : tableau toujours pas posé, à relancer.', context, date: '2026-09-30' }

beforeEach(() => {
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})

describe('/api/cr/ia', () => {
  it('renvoie la proposition nettoyée', async () => {
    generate.mockResolvedValue({
      ok: true, provider: 'anthropic', stopReason: 'end_turn',
      text: '```json\n' + JSON.stringify({
        resume: 'Réunion.', decisions: '',
        lots: [{ lot: 'Électricité', observations: 'Tableau absent.', avancement: 140 }, { lot: 'Vide', observations: '', avancement: null }],
        points_existants: [{ id: 't1', etat: 'relance', echeance: '2026-10-09' }, { id: 'inconnu', etat: 'fait', echeance: null }, { id: 't1', etat: 'bizarre', echeance: null }],
        nouveaux_points: [{ lot: 'Électricité', titre: 'Fournir le schéma', entreprise: 'Martin Élec', echeance: 'vendredi', priorite: 'Très urgent' }, { lot: 'x', titre: ' ', entreprise: '', echeance: null, priorite: 'En cours' }],
      }) + '\n```',
    })
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.lots).toEqual([{ lot: 'Électricité', observations: 'Tableau absent.', avancement: 100 }])
    expect(data.points_existants).toEqual([{ id: 't1', etat: 'relance', echeance: '2026-10-09' }])
    expect(data.nouveaux_points).toEqual([{ lot: 'Électricité', titre: 'Fournir le schéma', entreprise: 'Martin Élec', echeance: null, priorite: 'En cours' }])
    const call = generate.mock.calls[0][0]
    expect(call.json).toEqual(expect.objectContaining({ type: 'object' }))
    expect(call.messages[0].content).toContain('"date_reunion":"2026-09-30"')
    expect(call.messages[0].content).toContain('tableau toujours pas posé')
  })

  it('refuse sans compte staff', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(req(valid))).status).toBe(403)
    expect(generate).not.toHaveBeenCalled()
  })

  it('notes trop courtes', async () => {
    const res = await POST(req({ ...valid, notes: 'ok' }))
    expect(res.status).toBe(400)
  })

  it('erreur du service IA relayée', async () => {
    generate.mockResolvedValue({ ok: false, status: 503, message: 'Service IA momentanément surchargé' })
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('surchargé')
  })

  it('réponse illisible → 502', async () => {
    generate.mockResolvedValue({ ok: true, text: 'pas du json', stopReason: 'end_turn' })
    expect((await POST(req(valid))).status).toBe(502)
  })
})
