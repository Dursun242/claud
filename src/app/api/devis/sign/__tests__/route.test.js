/**
 * @jest-environment node
 */
let POST, verifyStaff, db, updates, uploads

const PDF = Buffer.from('%PDF-1.4 qonto').toString('base64')
const DEVIS = { id: 'd1', numero: 'D-2026-032', sign_token: null, statut_signature: null, signed_pdf_path: null }

function fakeAdmin() {
  return {
    from() {
      const b = {
        select: () => b, eq: () => b,
        update: (patch) => { updates.push(patch); return { eq: async () => ({ error: null }) } },
        maybeSingle: async () => ({ data: db.devis, error: null }),
      }
      return b
    },
    storage: {
      from: () => ({
        upload: async (path, buf, opts) => { uploads.push({ path, buf, opts }); return { error: db.uploadError || null } },
        download: async (path) => (db.files[path]
          ? { data: { arrayBuffer: async () => db.files[path] }, error: null }
          : { data: null, error: { message: 'not found' } }),
      }),
    },
  }
}

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
}

const req = (body) => ({ headers: { get: () => '1.2.3.4' }, json: async () => body })
const send = (extra = {}) => ({ action: 'send', devisId: 'd1', pdfBase64: PDF, signerEmail: 'client@exemple.fr', ...extra })

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  loadRoute()
  updates = []; uploads = []
  db = { devis: { ...DEVIS }, files: {} }
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})
afterEach(() => jest.restoreAllMocks())

describe('/api/devis/sign', () => {
  it('send : conserve le PDF Qonto, crée un jeton, enregistre la demande', async () => {
    const res = await POST(req(send()))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.token).toMatch(/^[a-f0-9]{64}$/)
    expect(uploads[0].path).toMatch(/^devis-signature\/d1\/original-\d+\.pdf$/)
    expect(uploads[0].buf.subarray(0, 4).toString()).toBe('%PDF')
    expect(updates[0]).toMatchObject({
      sign_token: body.data.token, sign_email: 'client@exemple.fr', statut_signature: 'Envoyé', sign_pdf_path: uploads[0].path,
    })
    expect(updates[0].sign_pdf_sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('send : refuse PDF invalide, email multiple, devis déjà signé, migration absente', async () => {
    expect((await POST(req(send({ pdfBase64: Buffer.from('nope').toString('base64') })))).status).toBe(400)
    expect((await POST(req(send({ signerEmail: 'a@b.fr, c@d.fr' })))).status).toBe(400)
    db.devis = { ...DEVIS, statut_signature: 'Signé' }
    expect((await POST(req(send()))).status).toBe(409)
    const { sign_token: _t, ...old } = DEVIS
    db.devis = old
    const res = await POST(req(send()))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('MIGRATION_029')
    expect(uploads).toHaveLength(0)
  })

  it('signed-pdf : renvoie le PDF signé ; 404 si pas encore signé', async () => {
    expect((await POST(req({ action: 'signed-pdf', devisId: 'd1' }))).status).toBe(404)
    db.devis = { ...DEVIS, statut_signature: 'Signé', signed_pdf_path: 'p/signe.pdf' }
    db.files['p/signe.pdf'] = Buffer.from('%PDF-signed')
    const body = await (await POST(req({ action: 'signed-pdf', devisId: 'd1' }))).json()
    expect(Buffer.from(body.data.base64, 'base64').toString()).toBe('%PDF-signed')
    expect(body.data.filename).toBe('Devis D-2026-032 signé.pdf')
  })

  it('non-staff : refusé', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req(send()))).status).toBe(403)
  })
})
