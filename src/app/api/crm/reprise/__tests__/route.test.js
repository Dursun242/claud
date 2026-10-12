/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/devisNotify', () => ({ notifyTeam: jest.fn() }))
jest.mock('@/app/lib/conformiteServer', () => ({ todayParis: () => '2026-10-12' }))

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
const req = ({ url = `https://app.test/api/crm/reprise?t=${TOKEN}`, body } = {}) => {
  const ip = `10.0.0.${++ipN}`
  return { url, headers: { get: (h) => (h === 'x-forwarded-for' ? ip : null) }, json: async () => body }
}

let db
beforeEach(() => {
  jest.clearAllMocks()
  db = memoryDb({
    crm_opportunites: [{ id: 'o1', titre: 'Maison Leroy', etape: 'En attente', contact_id: 'c1', motif_attente: 'Attente du financement', date_reprise: '2026-10-10', reprise_token: TOKEN }],
    crm_devis: [{ id: 'd1', opportunite_id: 'o1' }],
    crm_interactions: [
      { id: 'i1', opportunite_id: 'o1', prochaine_action: 'Reprendre contact (pas de réponse au mail de reprise)', prochaine_action_date: '2026-10-26', action_faite: false },
    ],
  })
  adminClient.mockReturnValue(db.client)
})

describe('/api/crm/reprise (page publique)', () => {
  it('GET : motif et choix ; jeton inconnu : 404', async () => {
    const { data } = await (await GET(req())).json()
    expect(data.motif).toBe('Attente du financement')
    expect(data.choix.map(c => c.code)).toEqual(['redemarre', 'pause3', 'pause6', 'abandon', 'autre'])
    expect((await GET(req({ url: `https://app.test/api/crm/reprise?t=${'b'.repeat(64)}` }))).status).toBe(404)
  })

  it('le projet redémarre : l’affaire repart en Négociation, équipe prévenue', async () => {
    const res = await POST(req({ body: { t: TOKEN, choix: 'redemarre', commentaire: 'Prêt accordé' } }))
    expect(res.status).toBe(200)
    expect(db.tables.crm_opportunites[0]).toMatchObject({ etape: 'Négociation', date_reprise: null })
    expect(db.tables.crm_interactions.find(i => i.id === 'i1').action_faite).toBe(true)
    expect(db.tables.crm_interactions.find(i => i.id !== 'i1')).toMatchObject({
      opportunite_id: 'o1', contact_id: 'c1', contenu: '« Prêt accordé »', prochaine_action_date: '2026-10-12',
    })
    const n = notifyTeam.mock.calls[0][1]
    expect(n.title).toBe('💬 Affaire en attente : Le projet redémarre')
    expect(n.mailLines).toContain('L\'affaire repasse en « Négociation » dans le CRM.')
  })

  it('toujours en pause : nouvelle date de reprise dans 3 mois', async () => {
    await POST(req({ body: { t: TOKEN, choix: 'pause3' } }))
    expect(db.tables.crm_opportunites[0]).toMatchObject({ etape: 'En attente', date_reprise: '2027-01-12' })
  })

  it('« Autre » sans précision refusé', async () => {
    expect((await POST(req({ body: { t: TOKEN, choix: 'autre', commentaire: '' } }))).status).toBe(400)
    expect(notifyTeam).not.toHaveBeenCalled()
  })
})
