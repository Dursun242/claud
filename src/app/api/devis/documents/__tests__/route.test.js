/**
 * @jest-environment node
 */
let POST, verifyStaff, storage
const { docDisplayName } = require('@/app/lib/devisDocuments')

function loadRoute() {
  jest.resetModules()
  storage = {
    list: jest.fn().mockResolvedValue({ data: [
      { id: '1', name: '1700000000001__Attestation décennale.pdf', metadata: { size: 1200 } },
      { id: '2', name: '1700000000000__Kbis.pdf', metadata: { size: 800 } },
      { id: null, name: 'sous-dossier' },
    ], error: null }),
    upload: jest.fn().mockResolvedValue({ error: null }),
    createSignedUploadUrl: jest.fn(async (path) => ({ data: { path, token: 'jeton', signedUrl: 'https://x' }, error: null })),
    remove: jest.fn().mockResolvedValue({ error: null }),
  }
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => ({ storage: { from: () => storage } }) }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
}

const jsonReq = (body) => ({ headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) }, json: async () => body })
const fileReq = (file, permanent) => ({
  headers: { get: (h) => (h === 'content-type' ? 'multipart/form-data; boundary=x' : null) },
  formData: async () => ({ get: (k) => ({ file, permanent: permanent ? '1' : '0' })[k] }),
})
const fakeFile = (name, type, size = 10) => ({ name, type, size, arrayBuffer: async () => new Uint8Array(size).buffer })

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); loadRoute() })
afterEach(() => jest.restoreAllMocks())

describe('/api/devis/documents', () => {
  it('liste les documents permanents avec leur nom lisible', async () => {
    const body = await (await POST(jsonReq({ action: 'list' }))).json()
    expect(body.data.docs).toEqual([
      { path: 'devis-documents/1700000000001__Attestation décennale.pdf', name: 'Attestation décennale.pdf', size: 1200 },
      { path: 'devis-documents/1700000000000__Kbis.pdf', name: 'Kbis.pdf', size: 800 },
    ])
  })

  it('dépose un document permanent ou un fichier ponctuel ; refuse format et taille', async () => {
    const perm = await (await POST(fileReq(fakeFile('Kbis 2026.pdf', 'application/pdf'), true))).json()
    expect(perm.data.path).toMatch(/^devis-documents\/\d+__Kbis 2026\.pdf$/)
    // Nom avec accents : clé Storage encodée (Supabase refuse les accents), nom d'origine conservé
    const once = await (await POST(fileReq(fakeFile('../plan/étage.png', 'image/png'), false))).json()
    expect(once.data).toMatchObject({ name: 'étage.png' })
    expect(once.data.path).toMatch(/^devis-envoi\/[0-9a-f-]{36}\/u-[A-Za-z0-9_-]+$/)
    expect(docDisplayName(once.data.path)).toBe('étage.png')
    expect((await POST(fileReq(fakeFile('x.exe', 'application/x-msdownload'), false))).status).toBe(400)
    expect((await POST(fileReq(fakeFile('gros.pdf', 'application/pdf', 5 * 1024 * 1024), false))).status).toBe(400)
    expect(storage.upload).toHaveBeenCalledTimes(2)
  })

  it('prepare : URL de dépôt signée (10 Mo), clé sans accent, type déduit de l’extension', async () => {
    const res = await POST(jsonReq({ action: 'prepare', name: 'Attestation décennale 2026.pdf', type: '', size: 8 * 1024 * 1024, permanent: true }))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toMatchObject({ token: 'jeton', name: 'Attestation décennale 2026.pdf', type: 'application/pdf' })
    expect(data.path).toMatch(/^devis-documents\/\d+__u-[A-Za-z0-9_-]+$/)
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(data.path)
    expect(docDisplayName(data.path)).toBe('Attestation décennale 2026.pdf')

    const big = await POST(jsonReq({ action: 'prepare', name: 'scan.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }))
    expect(big.status).toBe(400)
    expect((await big.json()).error).toContain('10 Mo')
    const heic = await POST(jsonReq({ action: 'prepare', name: 'IMG_0001.HEIC', type: 'image/heic', size: 1000 }))
    expect((await heic.json()).error).toContain('HEIC')
  })

  it('retire un document permanent seulement', async () => {
    expect((await POST(jsonReq({ action: 'remove', path: 'devis-documents/1__Kbis.pdf' }))).status).toBe(200)
    expect(storage.remove).toHaveBeenCalledWith(['devis-documents/1__Kbis.pdf'])
    expect((await POST(jsonReq({ action: 'remove', path: 'devis-signature/x/original.pdf' }))).status).toBe(400)
    expect((await POST(jsonReq({ action: 'remove', path: 'devis-documents/../x.pdf' }))).status).toBe(400)
  })

  it('réservé au staff', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(jsonReq({ action: 'list' }))).status).toBe(403)
  })
})
