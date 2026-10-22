/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))

// eslint-disable-next-line import/first
import { GET, POST } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const ID = '11111111-1111-4111-8111-111111111111'
const post = (body) => ({ url: 'https://app.test/api/contacts/vcard', headers: { get: () => null }, json: async () => body })
const get = (path) => ({ url: `https://app.test${path}`, headers: { get: () => null } })

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  verifyStaff.mockResolvedValue({ user: { email: 'moe@idm.fr' }, status: 200 })
  adminClient.mockReturnValue(memoryDb({
    contacts: [{ id: ID, nom: 'M. DEBRIS Julien', type: 'Client', tel: '06 13 33 55 75', email: 'debris.julien@hotmail.fr' }],
  }).client)
})

describe('/api/contacts/vcard', () => {
  it('lien signé (équipe) puis fiche vCard', async () => {
    const { url } = await (await POST(post({ contactId: ID }))).json()
    expect(url).toMatch(/^\/api\/contacts\/vcard\?id=/)
    const res = await GET(get(url))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/vcard; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="M-DEBRIS-Julien.vcf"')
    const text = await res.text()
    expect(text).toContain('N:DEBRIS;Julien;;M.;')
    expect(text).toContain('TEL;TYPE=CELL,VOICE:06 13 33 55 75')
  })

  it('refuse une signature fausse, un autre contact, un lien expiré', async () => {
    const { url } = await (await POST(post({ contactId: ID }))).json()
    expect((await GET(get(url.replace(/sig=[^&]+/, 'sig=abc')))).status).toBe(403)
    expect((await GET(get(url.replace(ID, '22222222-2222-4222-8222-222222222222')))).status).toBe(403)
    const now = Date.now()
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000)
    expect((await GET(get(url))).status).toBe(410)
    spy.mockRestore()
    expect((await GET(get('/api/contacts/vcard?id=x'))).status).toBe(400)
  })

  it('POST réservé à l’équipe, contact requis', async () => {
    expect((await POST(post({ contactId: 'x' }))).status).toBe(400)
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(post({ contactId: ID }))).status).toBe(403)
  })

  it('contact supprimé entre-temps : 404', async () => {
    const { url } = await (await POST(post({ contactId: ID }))).json()
    adminClient.mockReturnValue(memoryDb({ contacts: [] }).client)
    expect((await GET(get(url))).status).toBe(404)
  })
})
