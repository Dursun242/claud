/**
 * @jest-environment node
 */
// Tests de la route /api/odoo/sync-signatures : auth, validation de osId,
// et messages d'erreur génériques (le détail Odoo / base reste dans les logs).

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/odoo', () => ({ getSignRequestsStatusBulk: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { getSignRequestsStatusBulk } from '@/app/lib/odoo'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'

function makeRequest(qs = '') {
  return {
    url: `http://localhost/api/odoo/sync-signatures${qs}`,
    headers: { get: () => 'Bearer jwt' },
  }
}

// .from().select().not().not()|eq() → thenable { data, error } ; .update().eq() → { error }
function supaStub({ rows = [], selErr = null } = {}) {
  const updateEq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn(() => ({ eq: updateEq }))
  const query = {
    select: jest.fn(() => query),
    not: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: (resolve) => resolve({ data: rows, error: selErr }),
  }
  const client = { from: jest.fn(() => ({ ...query, update })) }
  return { client, update, updateEq }
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyAuth.mockResolvedValue({ id: 'u1', email: 'staff@idmaitrise.fr' })
})

describe('GET /api/odoo/sync-signatures', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(adminClient).not.toHaveBeenCalled()
  })

  it('renvoie 400 pour un osId invalide', async () => {
    const res = await GET(makeRequest('?osId=abc'))
    expect(res.status).toBe(400)
  })

  it('ne renvoie pas le message brut de la base en cas d\'erreur de lecture', async () => {
    adminClient.mockReturnValue(supaStub({ selErr: { message: 'relation "ordres_service" secret detail' } }).client)
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Lecture OS impossible')
    expect(JSON.stringify(json)).not.toMatch(/secret detail/)
  })

  it('ne renvoie pas le message brut d\'Odoo en cas d\'échec', async () => {
    adminClient.mockReturnValue(supaStub({ rows: [{ id: 1, numero: 'OS-1', odoo_sign_id: 10, statut_signature: 'Envoyé', statut: 'Émis' }] }).client)
    getSignRequestsStatusBulk.mockRejectedValue(new Error('Odoo RPC: AccessDenied user=admin db=prod'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('Erreur Odoo : synchronisation impossible')
    expect(JSON.stringify(json)).not.toMatch(/AccessDenied/)
  })

  it('met à jour le statut de signature et promeut un OS Émis → Signé', async () => {
    const supa = supaStub({ rows: [{ id: 1, numero: 'OS-1', odoo_sign_id: 10, statut_signature: 'Envoyé', statut: 'Émis' }] })
    adminClient.mockReturnValue(supa.client)
    getSignRequestsStatusBulk.mockResolvedValue([{ requestId: 10, statut_signature: 'Signé', signed_count: 3, total_count: 3 }])
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(supa.update).toHaveBeenCalledWith({ statut_signature: 'Signé', statut: 'Signé' })
    expect(supa.updateEq).toHaveBeenCalledWith('id', 1)
    expect((await res.json()).updated).toBe(1)
  })
})
