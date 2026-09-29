/**
 * @jest-environment node
 */
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}))

// eslint-disable-next-line import/first
import { GET, POST, DELETE } from '../route'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'

const req = (body) => ({ json: async () => body, headers: { get: () => 'Bearer t' } })
const ADMIN = { user: { id: 'a', profile: { role: 'admin' } }, status: 200 }
const SALARIE = { user: { id: 's', profile: { role: 'salarié' } }, status: 200 }

function stub(value) {
  const upsert = jest.fn().mockResolvedValue({ error: null })
  const delEq = jest.fn().mockResolvedValue({ error: null })
  const client = {
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: value ? { value } : null, error: null }) }) }),
      upsert,
      delete: () => ({ eq: delEq }),
    })),
  }
  adminClient.mockReturnValue(client)
  return { upsert, delEq }
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/qonto/token', () => {
  it('renvoie l’état de connexion et le login, jamais la clé secrète', async () => {
    verifyStaff.mockResolvedValue(SALARIE)
    stub('idmaitrise-1234:sk_live_SECRET')
    const res = await GET(req())
    const json = await res.json()
    expect(json).toEqual({ ok: true, connected: true, login: 'idmaitrise-1234' })
    expect(JSON.stringify(json)).not.toMatch(/SECRET/)
  })

  it('non connecté si aucun jeton', async () => {
    verifyStaff.mockResolvedValue(SALARIE)
    stub(null)
    expect(await (await GET(req())).json()).toEqual({ ok: true, connected: false, login: null })
  })

  it('403 pour un client (MOA)', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await GET(req())).status).toBe(403)
    expect(adminClient).not.toHaveBeenCalled()
  })
})

describe('POST / DELETE /api/qonto/token', () => {
  it('un admin enregistre un jeton valide', async () => {
    verifyStaff.mockResolvedValue(ADMIN)
    const { upsert } = stub(null)
    const res = await POST(req({ token: '  idm:sk_1 ' }))
    expect(await res.json()).toEqual({ ok: true, login: 'idm' })
    expect(upsert).toHaveBeenCalledWith({ key: 'qonto-token', value: 'idm:sk_1' })
  })

  it('refuse un format invalide', async () => {
    verifyStaff.mockResolvedValue(ADMIN)
    const { upsert } = stub(null)
    for (const token of ['sans-deux-points', ':sk', 'idm:sk avec espace', 'idm:sk\nX-Header: 1']) {
      expect((await POST(req({ token }))).status).toBe(400)
    }
    expect(upsert).not.toHaveBeenCalled()
  })

  it('un salarié ne peut ni connecter ni déconnecter Qonto', async () => {
    verifyStaff.mockResolvedValue(SALARIE)
    const { upsert, delEq } = stub('idm:sk')
    expect((await POST(req({ token: 'idm:sk' }))).status).toBe(403)
    expect((await DELETE(req())).status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
    expect(delEq).not.toHaveBeenCalled()
  })

  it('un admin déconnecte Qonto', async () => {
    verifyStaff.mockResolvedValue(ADMIN)
    const { delEq } = stub('idm:sk')
    expect(await (await DELETE(req())).json()).toEqual({ ok: true })
    expect(delEq).toHaveBeenCalledWith('key', 'qonto-token')
  })
})
