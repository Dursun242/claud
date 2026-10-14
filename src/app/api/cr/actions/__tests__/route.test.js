/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/devisNotify', () => ({ notifyTeam: jest.fn() }))
jest.mock('@/app/lib/conformiteServer', () => ({ todayParis: () => '2026-10-13' }))

// eslint-disable-next-line import/first
import { GET, POST } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { notifyTeam } from '@/app/lib/devisNotify'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const TOKEN = 'a'.repeat(64)
let ipN = 0
const req = ({ url = `https://app.test/api/cr/actions?t=${TOKEN}`, body } = {}) => {
  const ip = `10.1.0.${++ipN}`
  return { url, headers: { get: (h) => (h === 'x-forwarded-for' ? ip : null) }, json: async () => body }
}

let db
beforeEach(() => {
  jest.clearAllMocks()
  db = memoryDb({
    cr_liens: [{ token: TOKEN, chantier_id: 'ch', entreprise: 'Leroy Plâtrerie', nom: 'Paul', expire_le: '2026-12-01' }],
    chantiers: [{ id: 'ch', nom: 'Villa Dupont' }],
    taches: [
      { id: 't1', chantier_id: 'ch', titre: 'Reprendre l’enduit', entreprise: 'Leroy Plâtrerie', statut: 'En cours', num_point: 4, echeance: '2026-10-10' },
      { id: 't2', chantier_id: 'ch', titre: 'Poser le tableau', entreprise: 'Martin Élec', statut: 'En cours', num_point: 5 },
      { id: 't3', chantier_id: 'ch', titre: 'Soldé', entreprise: 'Leroy Plâtrerie', statut: 'Terminé', num_point: 1 },
    ],
    attachments: [],
  })
  adminClient.mockReturnValue(db.client)
})

describe('/api/cr/actions (page publique)', () => {
  it('GET : seulement les actions ouvertes de l’entreprise ; visite notée', async () => {
    const { data } = await (await GET(req())).json()
    expect(data).toMatchObject({ chantier: 'Villa Dupont', entreprise: 'Leroy Plâtrerie', today: '2026-10-13' })
    expect(data.actions.map(a => a.id)).toEqual(['t1'])
    expect(data.choix.map(c => c.code)).toEqual(['fait', 'delai', 'desaccord'])
    expect(db.tables.cr_liens[0].derniere_visite).toBeTruthy()
  })

  it('jeton inconnu, invalide ou expiré', async () => {
    expect((await GET(req({ url: `https://app.test/api/cr/actions?t=${'b'.repeat(64)}` }))).status).toBe(404)
    expect((await GET(req({ url: 'https://app.test/api/cr/actions?t=abc' }))).status).toBe(404)
    db.tables.cr_liens[0].expire_le = '2026-10-01'
    expect((await GET(req())).status).toBe(410)
  })

  it('c’est fait avec photo : réponse sur la tâche, photo dans les documents, équipe prévenue', async () => {
    const photo = `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`
    const res = await POST(req({ body: { t: TOKEN, tacheId: 't1', type: 'fait', commentaire: 'Enduit repris', photo } }))
    expect(res.status).toBe(200)
    const rep = db.tables.taches[0].reponse_entreprise
    expect(rep).toMatchObject({ type: 'fait', commentaire: 'Enduit repris', entreprise: 'Leroy Plâtrerie', nom: 'Paul' })
    expect(rep.photo).toMatch(/^chantier\/ch\/reponse-\d+\.jpg$/)
    expect(db.files.has(rep.photo)).toBe(true)
    expect(db.tables.attachments[0]).toMatchObject({ chantier_id: 'ch', file_path: rep.photo })
    expect(notifyTeam.mock.calls[0][1]).toMatchObject({
      entityType: 'task', chantierId: 'ch', targetTab: 'projects', title: '💬 Leroy Plâtrerie : Fait',
    })
  })

  it('refuse l’action d’une autre entreprise ou déjà soldée, et une réponse incomplète', async () => {
    expect((await POST(req({ body: { t: TOKEN, tacheId: 't2', type: 'fait' } }))).status).toBe(404)
    expect((await POST(req({ body: { t: TOKEN, tacheId: 't3', type: 'fait' } }))).status).toBe(404)
    const res = await POST(req({ body: { t: TOKEN, tacheId: 't1', type: 'delai' } }))
    expect(res.status).toBe(400)
    expect(db.tables.taches[0].reponse_entreprise).toBeUndefined()
  })

  it('plus de temps : nouvelle date gardée', async () => {
    await POST(req({ body: { t: TOKEN, tacheId: 't1', type: 'delai', date: '2026-10-24' } }))
    expect(db.tables.taches[0].reponse_entreprise).toMatchObject({ type: 'delai', date: '2026-10-24' })
  })
})
