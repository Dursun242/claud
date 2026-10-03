/**
 * @jest-environment node
 */
// Tests de /api/pv-reception/decision : le PV est lu avec le JWT de
// l'appelant (RLS) avant l'écriture en service role — un client ne peut
// donc décider que sur les PV de ses propres chantiers.

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/notifications', () => ({ createNotifications: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({
  adminClient: jest.fn(),
  userClientFromToken: jest.fn(),
  extractBearerToken: jest.fn(() => 'jwt'),
}))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { adminClient, userClientFromToken } from '@/app/lib/supabaseClients'

function makeRequest(body) {
  return {
    json: async () => body,
    headers: { get: (n) => (n.toLowerCase() === 'authorization' ? 'Bearer jwt' : null) },
  }
}

// Client "utilisateur" : .from().select().eq().single() → { data, error }
function userStub(pv) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(pv ? { data: pv, error: null } : { data: null, error: { message: 'no rows' } }),
  }
  return chain
}

// Client admin : .from().update().eq().or().select() → { data, error }
// rows = lignes renvoyées par la mise à jour conditionnelle ([] = aucune).
function adminStub(rows = [{ id: 'pv1' }]) {
  const select = jest.fn().mockResolvedValue({ data: rows, error: null })
  const or = jest.fn(() => ({ select }))
  const eq = jest.fn(() => ({ or }))
  const update = jest.fn(() => ({ eq }))
  return { client: { from: jest.fn(() => ({ update })) }, update, eq, or }
}

const PV = { id: 'pv1', chantier_id: 'c1', numero: 'PV-001', titre: 'Réception', statut_signature: 'Signé', statut_reception: 'En attente' }

beforeEach(() => {
  jest.clearAllMocks()
  verifyAuth.mockResolvedValue({ id: 'u1', email: 'moa@client.fr' })
})

describe('POST /api/pv-reception/decision', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Accepté' }))
    expect(res.status).toBe(401)
  })

  it('renvoie 404 sans rien écrire si le PV n\'est pas visible par l\'appelant', async () => {
    userClientFromToken.mockReturnValue(userStub(null))
    const admin = adminStub()
    adminClient.mockReturnValue(admin.client)

    const res = await POST(makeRequest({ pvId: 'pv-autre-chantier', decision: 'Accepté' }))
    expect(res.status).toBe(404)
    expect(userClientFromToken).toHaveBeenCalledWith('jwt')
    expect(admin.update).not.toHaveBeenCalled()
  })

  it('enregistre la décision quand le PV est visible et signé', async () => {
    userClientFromToken.mockReturnValue(userStub(PV))
    const admin = adminStub()
    adminClient.mockReturnValue(admin.client)

    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Refusé', motifRefus: 'Fissures' }))
    expect(res.status).toBe(200)
    expect(admin.update).toHaveBeenCalledWith(expect.objectContaining({ statut_reception: 'Refusé', motif_refus: 'Fissures' }))
    expect(admin.eq).toHaveBeenCalledWith('id', 'pv1')
    expect(admin.or).toHaveBeenCalledWith('statut_reception.is.null,statut_reception.eq."En attente"')
  })

  it('accepte un PV dont statut_reception est NULL (pas encore de décision)', async () => {
    userClientFromToken.mockReturnValue(userStub({ ...PV, statut_reception: null }))
    const admin = adminStub()
    adminClient.mockReturnValue(admin.client)

    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Accepté' }))
    expect(res.status).toBe(200)
  })

  it('renvoie 409 sans rien écrire si une décision est déjà enregistrée', async () => {
    userClientFromToken.mockReturnValue(userStub({ ...PV, statut_reception: 'Accepté' }))
    const admin = adminStub()
    adminClient.mockReturnValue(admin.client)

    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Refusé', motifRefus: 'Changement d\'avis' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/déjà été enregistrée/)
    expect(admin.update).not.toHaveBeenCalled()
  })

  it('renvoie 409 si la décision a été prise entre la lecture et l\'écriture', async () => {
    userClientFromToken.mockReturnValue(userStub(PV))
    const admin = adminStub([])
    adminClient.mockReturnValue(admin.client)

    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Accepté' }))
    expect(res.status).toBe(409)
  })

  it('refuse une décision sur un PV non signé', async () => {
    userClientFromToken.mockReturnValue(userStub({ ...PV, statut_signature: 'Envoyé' }))
    const res = await POST(makeRequest({ pvId: 'pv1', decision: 'Accepté' }))
    expect(res.status).toBe(400)
  })
})
