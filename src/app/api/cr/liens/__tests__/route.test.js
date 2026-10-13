/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/conformiteServer', () => ({ todayParis: () => '2026-10-13' }))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const CH = '11111111-1111-4111-8111-111111111111'
const req = (body) => ({ url: 'https://app.test/api/cr/liens', headers: { get: () => null }, json: async () => body })

beforeEach(() => {
  jest.clearAllMocks()
  verifyStaff.mockResolvedValue({ user: { email: 'a@idm.fr' }, status: 200 })
})

describe('/api/cr/liens', () => {
  it('un lien par entreprise, réutilisé et prolongé au CR suivant', async () => {
    const db = memoryDb({ cr_liens: [] })
    adminClient.mockReturnValue(db.client)
    const body = { chantierId: CH, destinataires: [{ email: 'paul@leroy.fr', entreprise: 'Leroy Plâtrerie', nom: 'Paul' }, { email: 'x@ex.fr', entreprise: '' }] }
    const first = await (await POST(req(body))).json()
    expect(Object.keys(first.liens)).toEqual(['paul@leroy.fr'])
    expect(first.liens['paul@leroy.fr']).toMatch(/^https:\/\/app\.test\/actions\/[a-f0-9]{64}$/)
    expect(db.tables.cr_liens[0]).toMatchObject({ chantier_id: CH, entreprise: 'Leroy Plâtrerie', expire_le: '2026-12-12' })
    db.tables.cr_liens[0].expire_le = '2026-11-01'
    const again = await (await POST(req(body))).json()
    expect(again.liens['paul@leroy.fr']).toBe(first.liens['paul@leroy.fr'])
    expect(db.tables.cr_liens).toHaveLength(1)
    expect(db.tables.cr_liens[0].expire_le).toBe('2026-12-12')
  })

  it('sans migration 046 : 503 avec un code ; staff seulement', async () => {
    adminClient.mockReturnValue(memoryDb({}, { errors: { cr_liens: { code: '42P01', message: 'relation "cr_liens" does not exist' } } }).client)
    const res = await POST(req({ chantierId: CH, destinataires: [{ email: 'p@l.fr', entreprise: 'Leroy' }] }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('MIGRATION_046')
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(req({ chantierId: CH }))).status).toBe(403)
  })
})
