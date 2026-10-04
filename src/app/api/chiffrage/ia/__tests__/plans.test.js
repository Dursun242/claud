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

// Même structure que l'export JSON d'une conversation DPGF (etat_final → dossier_actif → dpgf)
const EXPORT = {
  titre: 'DPGF MAISON', messages: [{ role: 'user', content: 'x' }],
  etat_final: { dossier_actif: {
    surfaces: { shab_total_m2: 167.2, garage_m2: 34.2 },
    dpgf: {
      reference: 'DPGF-2026-030 indice A',
      lots: [
        { numero: '01', intitule: "HONORAIRES MAÎTRISE D'ŒUVRE", postes: [{ n: '1.2', designation: 'Phase 1', unite: 'mois', quantite: 4, pu_ht: 2300, total_ht: 9200 }] },
        { numero: '04', intitule: 'GROS ŒUVRE, MAÇONNERIE', postes: [{ n: '4.5', designation: 'Plancher bas', unite: 'm²', quantite: 130, pu_ht: 110, total_ht: 14300 }] },
      ],
      observations: ['Sous réserve étude de sol G2.', 'Non compris : piscine.'],
    },
  } },
}

describe('/api/chiffrage/ia — import JSON, relecture, références', () => {
  it('importer : DPGF JSON repris sans IA (honoraires, surfaces, référence, observations)', async () => {
    const res = await POST(req({ action: 'importer', texte: JSON.stringify(EXPORT) }))
    const { data } = await res.json()
    expect(generate).not.toHaveBeenCalled()
    expect(data.lots.map(l => [l.nom, !!l.honoraires, l.postes[0].pu_ht])).toEqual([["HONORAIRES MAÎTRISE D'ŒUVRE", true, 2300], ['GROS ŒUVRE, MAÇONNERIE', false, 110]])
    expect(data).toMatchObject({ surface_m2: 167.2, surface_annexes: 34.2, reference: 'DPGF-2026-030', indice: 'A', observations: 'Sous réserve étude de sol G2.\nNon compris : piscine.', direct: true })
  })

  it('verifier : DPGF numéroté, verrous et totaux envoyés ; remarques nettoyées', async () => {
    generate.mockResolvedValue({ ok: true, stopReason: 'end', text: JSON.stringify({
      synthese: 'Niveau réaliste.', remarques: [{ type: 'oubli', poste: '', message: 'Dalle de toiture absente', impact_ht: 8000.4 }, { type: 'zzz', poste: '4.5', message: 'ok', impact_ht: 0 }],
    }) })
    const lots = [{ nom: 'GROS ŒUVRE', postes: [{ designation: 'Plancher bas', quantite: 130, unite: 'm²', pu_ht: 110, verrou: true }] }]
    const { data } = await (await POST(req({ action: 'verifier', lots, surface_m2: 167.2, surface_annexes: 34.2, tva_pct: 20 }))).json()
    expect(data).toEqual({ synthese: 'Niveau réaliste.', remarques: [
      { type: 'oubli', poste: '', message: 'Dalle de toiture absente', impact_ht: 8000 },
      { type: 'info', poste: '4.5', message: 'ok', impact_ht: 0 },
    ] })
    const sent = generate.mock.calls[0][0].messages[0].content
    expect(sent).toMatch(/"n":"1.1".*"verrou":true/)
    expect(sent).toMatch(/"surfaceRef":184.3/)
    expect(sent).toMatch(/bareme_id_maitrise/)
  })

  it('lot : barème ID Maîtrise et prix verrouillés des autres dossiers transmis', async () => {
    db.tables.chantier_chiffrages = [
      { chantier_id: 'autre', updated_at: '2026-10-01', lots: [{ nom: 'PLACO', postes: [{ designation: 'Cloisons 72/48', unite: 'm²', quantite: 10, pu_ht: 45, verrou: true }, { designation: 'Libre', unite: 'u', quantite: 1, pu_ht: 9 }] }] },
    ]
    generate.mockResolvedValue({ ok: true, stopReason: 'end', provider: 'mistral', text: JSON.stringify({ postes: [{ designation: 'Cloisons 72/48', quantite: 100, unite: 'm²', pu_ht: 45 }] }) })
    const { data } = await (await POST(req({ action: 'lot', chantierId: CH, description: 'Maison R+1 de 120 m² habitables', lot: { nom: 'PLACO', contenu: 'Cloisons' } }))).json()
    expect(data).toMatchObject({ postes: [{ designation: 'Cloisons 72/48', pu_ht: 45 }], ia: 'mistral' })
    const call = generate.mock.calls[0][0]
    expect(call).toMatchObject({ prefer: 'mistral', mistralModel: 'mistral-large-latest' })
    const sent = call.messages[0].content
    expect(sent).toMatch(/prix_fixes_dossiers":\[\{"lot":"PLACO","designation":"Cloisons 72\/48","unite":"m²","pu_ht":45\}\]/)
    expect(sent).toMatch(/Implantation de l'ouvrage/)
    expect(call.system).toMatch(/une seule ligne « Implantation de l'ouvrage »/)
  })
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

  it('trame : le métré relevé sur les plans est transmis', async () => {
    generate.mockResolvedValue({ ok: true, stopReason: 'end', provider: 'mistral', text: JSON.stringify({
      surface_m2: 112, lots: [{ nom: 'GROS ŒUVRE', contenu: 'Dallage' }], metre_cle: [], hypotheses: [], non_compris: [], conseils: [],
    }) })
    const res = await POST(req({ action: 'trame', description: 'Maison plain-pied 112 m²', metre: METRE.metre }))
    expect(res.status).toBe(200)
    expect(generate.mock.calls[0][0].messages[0].content).toMatch(/metre_plans.*Surface de plancher/)
  })
})
