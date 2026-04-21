/**
 * @jest-environment node
 */
// Tests de la route /api/pv-reception/create.
//
// POST crée un PV + l'envoie en signature Odoo + insère en DB + notifie.
// Couvre : auth, validations (chantierId, titre, PDF, signataires, décision),
// génération du numéro PV-YYYY-XXX, flux success, et les branches d'erreur.

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/odoo', () => ({ createSignRequestFromPdf: jest.fn() }))
jest.mock('@/app/lib/notifications', () => ({ createNotifications: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { createSignRequestFromPdf } from '@/app/lib/odoo'
// eslint-disable-next-line import/first
import { createNotifications } from '@/app/lib/notifications'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'

function makeRequest({ token, body } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

// Construit un stub Supabase qui :
//   - Sur SELECT (count des PV existants) → renvoie `existingCount` PVs
//   - Sur INSERT → renvoie l'objet `inserted`
//   - Sur UPDATE → résout sans erreur
function makeSupaStub({
  existingCount = 0,
  inserted = { id: 'pv-new', numero: 'PV-2026-001' },
  insertError = null,
  updateError = null,
} = {}) {
  const insertSpy = jest.fn()
  const updateSpy = jest.fn()
  const from = jest.fn((table) => {
    if (table !== 'proces_verbaux_reception') throw new Error('unexpected table ' + table)
    // Chaque appel from() crée un nouveau chainable — on distingue
    // select vs insert vs update par la 1ère méthode appelée.
    const chain = {
      // SELECT → count
      select: jest.fn().mockImplementation(() => {
        chain._mode = 'select'
        return chain
      }),
      eq: jest.fn().mockImplementation(function () {
        // Pour UPDATE : .eq() est terminal, résout
        if (chain._mode === 'update') return Promise.resolve({ error: updateError })
        return chain
      }),
      ilike: jest.fn().mockImplementation(() => {
        // Terminal sur SELECT count
        return Promise.resolve({
          data: Array(existingCount).fill({ numero: 'x' }),
          error: null,
        })
      }),
      // INSERT
      insert: jest.fn().mockImplementation((row) => {
        chain._mode = 'insert'
        insertSpy(row)
        return chain
      }),
      single: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          data: insertError ? null : inserted,
          error: insertError,
        })
      }),
      // UPDATE
      update: jest.fn().mockImplementation((row) => {
        chain._mode = 'update'
        updateSpy(row)
        return chain
      }),
    }
    return chain
  })
  return { client: { from }, insertSpy, updateSpy, fromSpy: from }
}

beforeEach(() => {
  verifyAuth.mockReset()
  createSignRequestFromPdf.mockReset()
  createNotifications.mockReset()
  adminClient.mockReset()
})

describe('POST /api/pv-reception/create', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: {} }))
    expect(res.status).toBe(401)
  })

  it('renvoie 400 si chantierId ou titre manque', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })

    const r1 = await POST(makeRequest({ token: 't', body: { titre: 'PV 1' } }))
    expect(r1.status).toBe(400)

    const r2 = await POST(makeRequest({ token: 't', body: { chantierId: 'c1' } }))
    expect(r2.status).toBe(400)
  })

  it("renvoie 400 si pdfBase64 absent", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const res = await POST(makeRequest({
      token: 't',
      body: { chantierId: 'c1', titre: 'PV' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/PDF/i)
  })

  it("renvoie 400 si MOE ou MOA manque", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const res = await POST(makeRequest({
      token: 't',
      body: { chantierId: 'c1', titre: 'PV', pdfBase64: 'xxx', signataireMoeEmail: 'moe@x.fr' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/MOE.*MOA/i)
  })

  it("renvoie 400 si la décision n'est pas dans la whitelist", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
        decision: 'SuperOK',
      },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Décision/i)
  })

  it("Refusé sans motifRefus → 400", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
        decision: 'Refusé',
      },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Motif/i)
  })

  it("'Accepté avec réserve' sans reservesAcceptation → 400", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
        decision: 'Accepté avec réserve',
      },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Réserves/i)
  })

  it('flow happy path : génère numéro, crée PV, envoie Odoo, met à jour, notifie', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'caller@x.fr' })
    const supa = makeSupaStub({
      existingCount: 2, // → numéro attendu PV-YYYY-003
      inserted: { id: 'pv-123', numero: 'will-be-computed' },
    })
    adminClient.mockReturnValue(supa.client)
    createSignRequestFromPdf.mockResolvedValue({
      requestId: 999, signUrl: 'https://odoo/pv/999', state: 'sent',
    })
    createNotifications.mockResolvedValue()

    const year = new Date().getFullYear()
    const expectedNumero = `PV-${year}-003`

    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'ch-uuid', titre: 'PV final Villa A',
        pdfBase64: 'JVBER...',
        signataireMoeEmail: 'moe@x.fr',
        signataireMotEmail: 'moa@x.fr',
        signataireEntrepriseEmail: 'ent@x.fr',
        description: 'Desc',
        dateReception: '2026-01-15',
      },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.numero).toBe(expectedNumero)
    expect(json.signUrl).toBe('https://odoo/pv/999')

    // INSERT contient le bon numéro et le statut initial
    expect(supa.insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      chantier_id: 'ch-uuid',
      numero: expectedNumero,
      titre: 'PV final Villa A',
      statut_signature: 'Brouillon',
      statut_reception: 'En attente',
      decision_immediat: false,
    }))

    // Odoo appelé avec 3 signataires
    expect(createSignRequestFromPdf).toHaveBeenCalledWith(expect.objectContaining({
      reference: expectedNumero,
      signers: expect.arrayContaining([
        expect.objectContaining({ role: 'MOE', email: 'moe@x.fr' }),
        expect.objectContaining({ role: 'MOA', email: 'moa@x.fr' }),
        expect.objectContaining({ role: 'Entreprise', email: 'ent@x.fr' }),
      ]),
    }))

    // UPDATE met les infos Odoo
    expect(supa.updateSpy).toHaveBeenCalledWith({
      odoo_sign_id: 999,
      odoo_sign_url: 'https://odoo/pv/999',
      statut_signature: 'Envoyé',
    })

    // Notification émise
    expect(createNotifications).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'pv',
      entityId: 'pv-123',
      chantierId: 'ch-uuid',
      action: 'create',
      actorEmail: 'caller@x.fr',
    }))
  })

  it("décision immédiate : statut_reception = décision et decision_immediat=true", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const supa = makeSupaStub()
    adminClient.mockReturnValue(supa.client)
    createSignRequestFromPdf.mockResolvedValue({ requestId: 1, signUrl: 'u', state: 'sent' })
    createNotifications.mockResolvedValue()

    await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
        decision: 'Accepté',
      },
    }))

    expect(supa.insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      statut_reception: 'Accepté',
      decision_immediat: true,
    }))
  })

  it("renvoie 500 si l'insert Supabase échoue", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const supa = makeSupaStub({ insertError: { message: 'DB down' } })
    adminClient.mockReturnValue(supa.client)

    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
      },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/création PV/i)
  })

  it("renvoie 500 si Odoo signature échoue (mais le PV reste créé en DB)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const supa = makeSupaStub()
    adminClient.mockReturnValue(supa.client)
    createSignRequestFromPdf.mockRejectedValue(new Error('Odoo down'))

    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
      },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/signature Odoo/i)
    // Insert a quand même été fait
    expect(supa.insertSpy).toHaveBeenCalled()
  })

  it("n'échoue pas si createNotifications jette (notification best-effort)", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1', email: 'u@x.fr' })
    const supa = makeSupaStub()
    adminClient.mockReturnValue(supa.client)
    createSignRequestFromPdf.mockResolvedValue({ requestId: 1, signUrl: 'u', state: 'sent' })
    createNotifications.mockRejectedValue(new Error('notif KO'))

    const res = await POST(makeRequest({
      token: 't',
      body: {
        chantierId: 'c1', titre: 'PV', pdfBase64: 'x',
        signataireMoeEmail: 'moe@x.fr', signataireMotEmail: 'moa@x.fr',
      },
    }))
    // Pas 500 : la notif est isolée dans son try/catch
    expect(res.status).toBe(200)
  })
})
