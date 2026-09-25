/**
 * @jest-environment node
 */
import { PDFDocument } from 'pdf-lib'
import crypto from 'node:crypto'

let GET, POST, db, updates, uploads, inserts

const TOKEN = 'b'.repeat(64)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
let ORIGINAL, HASH

function fakeAdmin() {
  return {
    from(table) {
      const q = { table, filters: [] }
      const b = {
        select: () => b,
        eq: (k, v) => { q.filters.push([k, v]); return b },
        neq: () => b,
        update: (patch) => { q.patch = patch; updates.push({ table, patch }); return b },
        insert: async (row) => { inserts.push({ table, row }); return { error: null } },
        maybeSingle: async () => ({ data: table === 'crm_devis' ? (q.filters.some(([k, v]) => k === 'sign_token' && v === db.devis?.sign_token) ? db.devis : null) : db[table], error: null }),
        then: (res) => res({ data: db.alreadySigned ? [] : [{ id: 'd1' }], error: null }),
      }
      return b
    },
    storage: {
      from: () => ({
        upload: async (path, buf) => { uploads.push({ path, buf }); return { error: null } },
        download: async (path) => (db.files[path]
          ? { data: { arrayBuffer: async () => db.files[path] }, error: null }
          : { data: null, error: { message: 'not found' } }),
      }),
    },
  }
}

const req = ({ url = `https://app.test/api/devis/public?token=${TOKEN}`, body } = {}) => ({
  url,
  headers: { get: (h) => ({ 'x-forwarded-for': '9.8.7.6', 'user-agent': 'Safari iOS' })[h] || null },
  json: async () => body,
})
const sign = (extra = {}) => req({ body: { token: TOKEN, name: 'Dursun OZKAN', signature: PNG, accept: true, ...extra } })

beforeAll(async () => {
  const d = await PDFDocument.create(); d.addPage()
  ORIGINAL = Buffer.from(await d.save())
  HASH = crypto.createHash('sha256').update(ORIGINAL).digest('hex')
})

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.resetModules()
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  ;({ GET, POST } = require('../route'))
  updates = []; uploads = []; inserts = []
  db = {
    devis: {
      id: 'd1', numero: 'D-2026-032', objet: 'Garage', statut: 'Envoyé', opportunite_id: 'o1', total_ht: 5000, total_ttc: 6000,
      date_emission: '2026-09-25', date_validite: '2099-12-31', sign_token: TOKEN, statut_signature: 'Envoyé',
      sign_pdf_path: 'devis-signature/d1/original-1.pdf', sign_pdf_sha256: HASH,
    },
    crm_opportunites: { id: 'o1', etape: 'Devis envoyé', contact_id: 'c1' },
    contacts: { nom: 'OZKAN Dursun' },
    files: { 'devis-signature/d1/original-1.pdf': ORIGINAL },
  }
})
afterEach(() => jest.restoreAllMocks())

describe('/api/devis/public', () => {
  it('GET : résumé du devis par jeton ; jeton inconnu → 404', async () => {
    const body = await (await GET(req())).json()
    expect(body.data).toMatchObject({ numero: 'D-2026-032', objet: 'Garage', total_ttc: 6000, client: 'OZKAN Dursun', expired: false })
    expect((await GET(req({ url: `https://app.test/api/devis/public?token=${'c'.repeat(64)}` }))).status).toBe(404)
    expect((await GET(req({ url: 'https://app.test/api/devis/public?token=../x' }))).status).toBe(404)
  })

  it('GET pdf=1 : renvoie le PDF', async () => {
    const res = await GET(req({ url: `https://app.test/api/devis/public?token=${TOKEN}&pdf=1` }))
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF')
  })

  it('POST : signe, stocke le PDF signé, devis Accepté, affaire Gagné, trace', async () => {
    const res = await POST(sign())
    expect(res.status).toBe(200)
    expect(uploads[0].path).toBe('devis-signature/d1/signe-1.pdf')
    expect(uploads[0].buf.subarray(0, 4).toString()).toBe('%PDF')
    const devisUpdate = updates.find(u => u.table === 'crm_devis').patch
    expect(devisUpdate).toMatchObject({
      statut_signature: 'Signé', statut: 'Accepté', signed_name: 'Dursun OZKAN', signed_ip: '9.8.7.6',
      signed_user_agent: 'Safari iOS', signed_pdf_path: 'devis-signature/d1/signe-1.pdf',
    })
    expect(updates.find(u => u.table === 'crm_opportunites').patch).toMatchObject({ etape: 'Gagné', probabilite: 100, montant_estime: 5000 })
    expect(inserts[0].row).toMatchObject({ opportunite_id: 'o1', type: 'Note', sujet: 'Devis D-2026-032 signé en ligne' })
  })

  it('POST : refuse sans nom, sans signature, sans accord', async () => {
    expect((await POST(sign({ name: ' ' }))).status).toBe(400)
    expect((await POST(sign({ signature: '' }))).status).toBe(400)
    expect((await POST(sign({ accept: false }))).status).toBe(400)
    expect(uploads).toHaveLength(0)
  })

  it('POST : refuse devis déjà signé, expiré, ou PDF modifié', async () => {
    db.devis.statut_signature = 'Signé'
    expect((await POST(sign())).status).toBe(409)
    db.devis.statut_signature = 'Envoyé'; db.devis.date_validite = '2020-01-01'
    expect((await POST(sign())).status).toBe(409)
    db.devis.date_validite = '2099-12-31'; db.devis.sign_pdf_sha256 = 'f'.repeat(64)
    const res = await POST(sign())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/modifié/)
  })

  it('POST : double clic → le second est refusé', async () => {
    db.alreadySigned = true
    expect((await POST(sign())).status).toBe(409)
  })
})
