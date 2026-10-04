/**
 * @jest-environment node
 */
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/ai', () => ({ ...jest.requireActual('@/app/lib/ai'), generate: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { generate } from '@/app/lib/ai'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const CH = '11111111-2222-3333-4444-555555555555'
let ip = 0
const req = (body) => ({ headers: { get: (n) => (n.toLowerCase() === 'x-forwarded-for' ? `10.0.0.${++ip}` : 'Bearer t') }, json: async () => body })
const METRE = {
  projet: 'Maison plain-pied, 3 chambres.', surface_m2: 112.4,
  metre: [{ element: 'Surface de plancher', quantite: 112.4, unite: 'm²', source: 'tableau des surfaces' }, { element: '', quantite: 1, unite: 'u', source: '' }],
  alertes: ['Coupe absente'],
}

let db
beforeEach(() => {
  jest.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  delete process.env.ANTHROPIC_PLANS_MODEL
  db = memoryDb({ chantiers: [{ id: CH, nom: 'Villa' }] })
  adminClient.mockReturnValue(db.client)
  verifyStaff.mockResolvedValue({ user: { email: 'a@b.fr' }, status: 200 })
})

describe('/api/chiffrage/ia — plans du permis', () => {
  it('prepare_plan : chemin propre au chantier, formats et tailles contrôlés', async () => {
    const { data } = await (await POST(req({ action: 'prepare_plan', chantierId: CH, name: 'PCMI plans.pdf', size: 3e6 }))).json()
    expect(data.path).toMatch(new RegExp(`^chiffrage-plans/${CH}/\\d+__`))
    expect(data).toMatchObject({ token: 'jeton-depot', type: 'application/pdf' })
    expect((await POST(req({ action: 'prepare_plan', chantierId: CH, name: 'plan.dwg', size: 1e5 }))).status).toBe(400)
    expect((await POST(req({ action: 'prepare_plan', chantierId: CH, name: 'gros.pdf', size: 30e6 }))).status).toBe(400)
    expect((await POST(req({ action: 'prepare_plan', chantierId: 'x', name: 'a.pdf', size: 1 }))).status).toBe(404)
  })

  it('metre : plans lus par Claude, métré nettoyé, fichiers effacés', async () => {
    process.env.ANTHROPIC_PLANS_MODEL = 'modele-plans'
    const pdf = `chiffrage-plans/${CH}/1__plans.pdf`
    const photo = `chiffrage-plans/${CH}/2__facade.jpg`
    db.putFile(pdf); db.putFile(photo, 'jpg', 'image/jpeg')
    generate.mockResolvedValue({ ok: true, text: JSON.stringify(METRE), stopReason: 'end' })
    const res = await POST(req({ action: 'metre', chantierId: CH, paths: [pdf, photo], notes: 'Finitions standard' }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toEqual({
      projet: 'Maison plain-pied, 3 chambres.', surface_m2: 112,
      metre: [{ element: 'Surface de plancher', quantite: 112.4, unite: 'm²', source: 'tableau des surfaces' }],
      alertes: ['Coupe absente'],
    })
    const call = generate.mock.calls[0][0]
    expect(call.anthropicModel).toBe('modele-plans')
    expect(call.maxRetries).toBe(0)
    const parts = call.messages[0].content
    expect(parts.map(p => p.type)).toEqual(['document', 'image', 'text'])
    expect(parts[1].mediaType).toBe('image/jpeg')
    expect(parts[2].text).toMatch(/Finitions standard/)
    expect(db.files.size).toBe(0)
  })

  it('metre : chemin d’un autre chantier refusé, fichier absent → 404, échec IA → fichiers gardés', async () => {
    expect((await POST(req({ action: 'metre', chantierId: CH, paths: ['chiffrage-plans/autre/1__a.pdf'] }))).status).toBe(400)
    expect((await POST(req({ action: 'metre', chantierId: CH, paths: [`chiffrage-plans/${CH}/9__absent.pdf`] }))).status).toBe(404)
    const pdf = `chiffrage-plans/${CH}/1__plans.pdf`
    db.putFile(pdf)
    generate.mockResolvedValue({ ok: false, status: 503, message: 'Service IA momentanément surchargé' })
    const res = await POST(req({ action: 'metre', chantierId: CH, paths: [pdf] }))
    expect(res.status).toBe(503)
    expect(db.files.has(pdf)).toBe(true)
  })

  it('generer : le métré relevé sur les plans est transmis', async () => {
    generate.mockResolvedValue({ ok: true, stopReason: 'end', text: JSON.stringify({
      lots: [{ nom: 'Gros œuvre', postes: [{ designation: 'Dallage', quantite: 112, unite: 'm²', pu_ht: 70 }] }], surface_m2: 112, hypotheses: [], conseils: [],
    }) })
    const res = await POST(req({ action: 'generer', description: 'Maison plain-pied 112 m²', metre: METRE.metre }))
    expect(res.status).toBe(200)
    expect(generate.mock.calls[0][0].messages[0].content).toMatch(/metre_plans.*Surface de plancher/)
  })
})
