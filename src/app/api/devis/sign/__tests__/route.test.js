/**
 * @jest-environment node
 */
let POST, verifyStaff, odoo, db, updates

const PDF = Buffer.from('%PDF-1.4\n/Type /Page\n/Type /Pages\n/Type /Page\n').toString('base64')
const DEVIS = { id: 'd1', numero: 'D-2026-032', objet: 'Garage', statut: 'Brouillon', odoo_sign_id: null, statut_signature: null }

function fakeAdmin() {
  return {
    from() {
      const q = { patch: null }
      const b = {
        select: () => b, eq: () => b, not: () => b,
        update: (patch) => { q.patch = patch; updates.push(patch); return b },
        maybeSingle: async () => ({ data: db.devis, error: null }),
        single: async () => ({ data: { ...db.devis, ...q.patch }, error: null }),
        then: (res) => res(q.patch ? { error: null } : { data: db.rows, error: db.rowsError || null }),
      }
      return b
    },
  }
}

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  jest.doMock('@/app/lib/odoo', () => ({
    createSignRequestFromPdf: jest.fn(),
    getSignRequestsStatusBulk: jest.fn(),
    countPdfPages: jest.requireActual('@/app/lib/odoo').countPdfPages,
  }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
  odoo = require('@/app/lib/odoo')
}

const req = (body) => ({ headers: { get: () => '1.2.3.4' }, json: async () => body })
const send = (extra = {}) => ({ action: 'send', devisId: 'd1', pdfBase64: PDF, signerEmail: 'client@exemple.fr', signerName: 'OZKAN Dursun', ...extra })

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  loadRoute()
  updates = []
  db = { devis: { ...DEVIS }, rows: [] }
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})
afterEach(() => jest.restoreAllMocks())

describe('/api/devis/sign', () => {
  it('send : demande Odoo Sign avec le client, zone bas-droite de la dernière page', async () => {
    odoo.createSignRequestFromPdf.mockResolvedValue({ requestId: 77, signUrl: 'https://odoo/sign/77' })
    const res = await POST(req(send()))
    expect(res.status).toBe(200)
    expect(odoo.createSignRequestFromPdf).toHaveBeenCalledWith({
      pdfBase64: PDF, reference: 'Devis D-2026-032', operationName: 'Garage',
      signers: [{ name: 'OZKAN Dursun', email: 'client@exemple.fr', role: 'Client' }],
      placement: { posX: 0.62, posY: 0.70, page: 2 },
    })
    expect(updates[0]).toEqual({ odoo_sign_id: 77, odoo_sign_url: 'https://odoo/sign/77', statut_signature: 'Envoyé' })
  })

  it('send : refuse PDF invalide, email invalide, migration 029 absente', async () => {
    expect((await POST(req(send({ pdfBase64: Buffer.from('pas un pdf').toString('base64') })))).status).toBe(400)
    expect((await POST(req(send({ signerEmail: 'a@b.fr, c@d.fr' })))).status).toBe(400)
    const { odoo_sign_id: _o, statut_signature: _s, ...old } = DEVIS
    db.devis = old
    const res = await POST(req(send()))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('MIGRATION_029')
    expect(odoo.createSignRequestFromPdf).not.toHaveBeenCalled()
  })

  it('send : erreur Odoo → 502 avec message', async () => {
    odoo.createSignRequestFromPdf.mockRejectedValue(new Error('Odoo timeout'))
    const res = await POST(req(send()))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Odoo timeout/)
  })

  it('sync : signé → Accepté, refusé → Refusé ; statuts finaux ignorés', async () => {
    db.rows = [
      { id: 'd1', numero: 'D-1', statut: 'Envoyé', opportunite_id: 'o1', total_ht: 100, odoo_sign_id: 1, statut_signature: 'Envoyé' },
      { id: 'd2', numero: 'D-2', statut: 'Envoyé', opportunite_id: 'o2', total_ht: 200, odoo_sign_id: 2, statut_signature: 'Envoyé' },
      { id: 'd3', numero: 'D-3', statut: 'Accepté', opportunite_id: 'o3', total_ht: 300, odoo_sign_id: 3, statut_signature: 'Signé' },
    ]
    odoo.getSignRequestsStatusBulk.mockResolvedValue([
      { requestId: 1, statut_signature: 'Signé' },
      { requestId: 2, statut_signature: 'Refusé' },
    ])
    const body = await (await POST(req({ action: 'sync' }))).json()
    expect(odoo.getSignRequestsStatusBulk).toHaveBeenCalledWith([1, 2])
    expect(updates[0]).toMatchObject({ statut_signature: 'Signé', statut: 'Accepté' })
    expect(updates[1]).toMatchObject({ statut_signature: 'Refusé', statut: 'Refusé' })
    expect(body.data.changes.map(c => [c.numero, c.statut_signature])).toEqual([['D-1', 'Signé'], ['D-2', 'Refusé']])
  })

  it('sync sans migration 029 : aucun changement, pas d’erreur', async () => {
    db.rowsError = { message: 'column crm_devis.odoo_sign_id does not exist' }
    const res = await POST(req({ action: 'sync' }))
    expect(res.status).toBe(200)
    expect((await res.json()).data.changes).toEqual([])
  })

  it('non-staff : refusé', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req({ action: 'sync' }))).status).toBe(403)
  })
})
