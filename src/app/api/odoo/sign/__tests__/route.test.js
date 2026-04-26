/**
 * @jest-environment node
 */
// Tests de la route /api/odoo/sign.
//
// POST crée une demande de signature Odoo (depuis un PDF base64 ou un
// templateId Odoo) + met à jour la colonne odoo_sign_* de l'OS côté
// Supabase. GET vérifie le statut d'une signature existante.

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/odoo', () => ({
  createSignRequest: jest.fn(),
  createSignRequestFromPdf: jest.fn(),
  getSignRequestStatus: jest.fn(),
}))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { POST, GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { createSignRequest, createSignRequestFromPdf, getSignRequestStatus } from '@/app/lib/odoo'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'

function makeRequest({ token, body, url = 'http://x/api/odoo/sign' } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    url,
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

// Factory pour le mock de supabase admin qui update les colonnes sign
// de la table ordres_service.
function makeSupaUpdateSpy() {
  const updateSpy = jest.fn().mockReturnThis()
  const eqSpy = jest.fn().mockResolvedValue({ error: null })
  return {
    client: {
      from: jest.fn().mockReturnValue({
        update: updateSpy,
        eq: eqSpy,
      }),
    },
    updateSpy,
    eqSpy,
  }
}

beforeEach(() => {
  verifyAuth.mockReset()
  createSignRequest.mockReset()
  createSignRequestFromPdf.mockReset()
  getSignRequestStatus.mockReset()
  adminClient.mockReset()
})

describe('POST /api/odoo/sign', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: { pdfBase64: 'xxx', signers: [{ email: 'a@b.c' }] } }))
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si ni signers[] ni signerEmail ne sont fournis", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({ token: 't', body: { pdfBase64: 'xxx' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/signataire/i)
  })

  it("flux PDF : appelle createSignRequestFromPdf avec les signers fournis", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequestFromPdf.mockResolvedValue({
      requestId: 42, signUrl: 'https://odoo/sign/42', state: 'sent',
    })

    const signers = [
      { name: 'MOE', email: 'moe@x.fr', role: 'MOE' },
      { name: 'MOA', email: 'moa@x.fr', role: 'MOA' },
      { name: 'Ent', email: 'ent@x.fr', role: 'Entreprise' },
    ]
    const res = await POST(makeRequest({
      token: 't',
      body: { pdfBase64: 'JVBERiXXX', reference: 'OS-2026-001', operationName: 'Villa A', signers },
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ requestId: 42, signUrl: 'https://odoo/sign/42' })
    expect(createSignRequestFromPdf).toHaveBeenCalledWith({
      pdfBase64: 'JVBERiXXX',
      reference: 'OS-2026-001',
      operationName: 'Villa A',
      signers,
    })
  })

  it("flux PDF legacy : si signers vide mais signerEmail fourni, construit un [Entreprise]", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequestFromPdf.mockResolvedValue({ requestId: 1, signUrl: 'u', state: 'sent' })

    await POST(makeRequest({
      token: 't',
      body: { pdfBase64: 'x', signerName: 'Bob', signerEmail: 'bob@x.fr' },
    }))

    expect(createSignRequestFromPdf).toHaveBeenCalledWith(expect.objectContaining({
      signers: [{ name: 'Bob', email: 'bob@x.fr', role: 'Entreprise' }],
    }))
  })

  it("flux template Odoo (pas de pdfBase64) : appelle createSignRequest avec templateId", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequest.mockResolvedValue({ requestId: 99, signUrl: 'u99', state: 'sent' })

    const res = await POST(makeRequest({
      token: 't',
      body: { templateId: 5, signerName: 'X', signerEmail: 'x@y.fr', reference: 'R' },
    }))

    expect(res.status).toBe(200)
    expect(createSignRequest).toHaveBeenCalledWith({
      templateId: 5, signerName: 'X', signerEmail: 'x@y.fr', reference: 'R',
    })
  })

  it("flux template : 400 si ni pdfBase64 ni templateId", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeRequest({
      token: 't', body: { signerEmail: 'x@y.fr' },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/templateId|pdfBase64/i)
  })

  it("met à jour ordres_service avec odoo_sign_id + url quand osId fourni", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequestFromPdf.mockResolvedValue({
      requestId: 777, signUrl: 'https://odoo/sign/777', state: 'sent',
    })
    const supa = makeSupaUpdateSpy()
    adminClient.mockReturnValue(supa.client)

    await POST(makeRequest({
      token: 't',
      body: {
        pdfBase64: 'x',
        signers: [{ email: 'x@y.fr', role: 'Entreprise' }],
        osId: 'os-uuid-123',
      },
    }))

    expect(supa.client.from).toHaveBeenCalledWith('ordres_service')
    expect(supa.updateSpy).toHaveBeenCalledWith({
      odoo_sign_id: 777,
      odoo_sign_url: 'https://odoo/sign/777',
      statut_signature: 'Envoyé',
    })
    expect(supa.eqSpy).toHaveBeenCalledWith('id', 'os-uuid-123')
  })

  it("ne touche PAS ordres_service si osId absent", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequestFromPdf.mockResolvedValue({ requestId: 1, signUrl: 'u', state: 'sent' })

    await POST(makeRequest({
      token: 't',
      body: { pdfBase64: 'x', signers: [{ email: 'x@y.fr', role: 'Entreprise' }] },
    }))

    expect(adminClient).not.toHaveBeenCalled()
  })

  it("renvoie 500 (message générique) si Odoo échoue", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    createSignRequestFromPdf.mockRejectedValue(new Error('Odoo timeout'))

    const res = await POST(makeRequest({
      token: 't',
      body: { pdfBase64: 'x', signers: [{ email: 'x@y.fr', role: 'Entreprise' }] },
    }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/signature/i)
  })
})

describe('GET /api/odoo/sign', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest({ url: 'http://x/api/odoo/sign?requestId=42' }))
    expect(res.status).toBe(401)
  })

  it("renvoie 400 si requestId manque ou <= 0", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })

    const r1 = await GET(makeRequest({ url: 'http://x/api/odoo/sign', token: 't' }))
    expect(r1.status).toBe(400)

    const r2 = await GET(makeRequest({ url: 'http://x/api/odoo/sign?requestId=0', token: 't' }))
    expect(r2.status).toBe(400)

    const r3 = await GET(makeRequest({ url: 'http://x/api/odoo/sign?requestId=abc', token: 't' }))
    expect(r3.status).toBe(400)
  })

  it("renvoie le statut Odoo sur requestId valide", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    getSignRequestStatus.mockResolvedValue({
      id: 42, state: 'signed', reference: 'OS-001',
      items: [{ state: 'signed', partner_id: [1, 'x@y.fr'] }],
    })

    const res = await GET(makeRequest({ url: 'http://x/api/odoo/sign?requestId=42', token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.state).toBe('signed')
    expect(getSignRequestStatus).toHaveBeenCalledWith(42)
  })

  it("renvoie 500 (message générique) si Odoo jette", async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    getSignRequestStatus.mockRejectedValue(new Error('Not found'))

    const res = await GET(makeRequest({ url: 'http://x/api/odoo/sign?requestId=99', token: 't' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/statut/i)
  })
})
