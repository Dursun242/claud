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

const link = async () => {
  const { exp, sig } = await (await POST(post({}))).json()
  return (id = ID) => `/api/contacts/vcard?${new URLSearchParams({ id, exp: String(exp), sig })}`
}

describe('/api/contacts/vcard', () => {
  it('clé signée (équipe) puis fiche vCard', async () => {
    const url = (await link())()
    const res = await GET(get(url))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/vcard; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="M-DEBRIS-Julien.vcf"')
    const text = await res.text()
    expect(text).toContain('N:DEBRIS;Julien;;M.;')
    expect(text).toContain('TEL;TYPE=CELL,VOICE:06 13 33 55 75')
  })

  it('refuse une signature fausse, une date modifiée, un lien expiré', async () => {
    const url = (await link())()
    expect((await GET(get(url.replace(/sig=[^&]+/, 'sig=abc')))).status).toBe(403)
    expect((await GET(get(url.replace(/exp=(\d+)/, (_, e) => `exp=${Number(e) + 3600}`)))).status).toBe(403)
    const now = Date.now()
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 3 * 3600 * 1000)
    expect((await GET(get(url))).status).toBe(410)
    spy.mockRestore()
    expect((await GET(get('/api/contacts/vcard?id=x'))).status).toBe(400)
  })

  it('clé réservée à l’équipe', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(post({}))).status).toBe(403)
  })

  it('contact inconnu ou supprimé : 404', async () => {
    const url = await link()
    expect((await GET(get(url('22222222-2222-4222-8222-222222222222')))).status).toBe(404)
  })
})
