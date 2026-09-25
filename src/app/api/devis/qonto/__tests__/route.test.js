/**
 * @jest-environment node
 */
let POST, verifyStaff, fetchWithRetry, db, updates

const DEVIS = {
  id: 'd1', opportunite_id: 'o1', numero: '26-050', statut: 'Brouillon', objet: 'Escalier',
  date_emission: '2026-09-25', date_validite: '2026-10-25', remise_pct: 0, acompte_pct: 0,
  conditions: 'CGV', notes: '', qonto_quote_id: null, qonto_client_id: null,
  lignes: [{ type: 'ligne', designation: 'Escalier', unite: 'forfait', quantite: 1, prix_unitaire: 1000, tva_taux: 20 }],
}

// Faux client Supabase : from(table).select().eq().maybeSingle() / update().eq().select().single()
function fakeAdmin() {
  return {
    from(table) {
      const q = { table, patch: null }
      const b = {
        select: () => b,
        eq: () => b,
        update: (patch) => { q.patch = patch; return b },
        maybeSingle: async () => ({ data: db[table], error: null }),
        single: async () => {
          updates.push({ table, patch: q.patch })
          if (q.patch?.numero && db.numeroConflict) return { data: null, error: { code: '23505', message: 'dup' } }
          return { data: { ...db[table], ...q.patch }, error: null }
        },
        then: (res) => res({ data: db.rows || [], error: null }),
      }
      return b
    },
  }
}

const json = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) })

function loadRoute() {
  jest.resetModules()
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
  fetchWithRetry = require('@/app/lib/fetchWithRetry').fetchWithRetry
}

const req = (body) => ({ headers: { get: () => '1.2.3.4' }, json: async () => body })
const calls = () => fetchWithRetry.mock.calls.map(([url, o]) => `${o.method} ${url.replace('https://thirdparty.qonto.com/v2', '')}`)

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  loadRoute()
  updates = []
  db = {
    settings: { value: 'login:secret' },
    crm_devis: { ...DEVIS },
    crm_opportunites: { id: 'o1', titre: 'Escalier', contact_id: 'c1' },
    contacts: { id: 'c1', nom: 'Jean Dupont', email: 'jean@exemple.fr' },
    rows: [{ numero: '26-050' }],
  }
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})

afterEach(() => jest.restoreAllMocks())

describe('/api/devis/qonto', () => {
  it('crée le client puis le devis avec le même numéro et enregistre le lien', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(json(200, { clients: [], meta: {} }))
      .mockResolvedValueOnce(json(201, { client: { id: 'qc1' } }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-050', quote_url: 'https://q/1', total_amount: { value: '1200.00' } } }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(calls()).toEqual(['GET /clients?per_page=100&page=1', 'POST /clients', 'POST /quotes'])
    const [, quoteOpts] = fetchWithRetry.mock.calls[2]
    expect(quoteOpts.headers.Authorization).toBe('login:secret')
    expect(quoteOpts.maxRetries).toBe(0)
    expect(JSON.parse(quoteOpts.body)).toMatchObject({ client_id: 'qc1', number: '26-050', items: [{ vat_rate: '0.2' }] })
    expect(updates[0].patch).toMatchObject({ qonto_quote_id: 'qq1', qonto_client_id: 'qc1', qonto_url: 'https://q/1' })
    expect(updates[0].patch.qonto_hash).toBeTruthy()
    expect(body.data).toMatchObject({ created: true, qontoNumber: '26-050', mismatch: null, renumbered: null })
  })

  it('met à jour le devis Qonto existant (PATCH) sans rechercher le client', async () => {
    db.crm_devis = { ...DEVIS, qonto_quote_id: 'qq1', qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(200, { quote: { id: 'qq1', number: '26-050', total_amount: { value: '1200.00' } } }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(200)
    expect(calls()).toEqual(['PATCH /quotes/qq1'])
    expect((await res.json()).data.created).toBe(false)
  })

  it('réutilise un client Qonto existant retrouvé par email', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(json(200, { clients: [{ id: 'qc9', name: 'X', email: 'JEAN@exemple.fr' }], meta: {} }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-050' } }))
    await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(calls()).toEqual(['GET /clients?per_page=100&page=1', 'POST /quotes'])
    expect(JSON.parse(fetchWithRetry.mock.calls[1][1].body).client_id).toBe('qc9')
  })

  it('numéro déjà pris dans Qonto : 409 avec le prochain numéro libre', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry
      .mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/number' }, detail: 'has already been taken' }] }))
      .mockResolvedValueOnce(json(200, { quotes: [{ number: '26-050' }, { number: '26-061' }], meta: {} }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('NUMBER_TAKEN')
    expect(body.error).toMatch(/26-062/)
    expect(updates).toEqual([])
  })

  it('unité refusée : renvoie le devis sans unités', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry
      .mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/items/0/unit' }, detail: 'is not included in the list' }] }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-050' } }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(200)
    expect(JSON.parse(fetchWithRetry.mock.calls[1][1].body).items[0].unit).toBeUndefined()
  })

  it('numérotation automatique Qonto : le devis reprend le numéro Qonto', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: 'D-2026-012' } }))
    const body = await (await POST(req({ action: 'sync', devisId: 'd1' }))).json()
    expect(updates[0].patch.numero).toBe('D-2026-012')
    expect(body.data.renumbered).toBe('D-2026-012')
  })

  it('signale un écart de total', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-050', total_amount: { value: '1100.00' } } }))
    const body = await (await POST(req({ action: 'sync', devisId: 'd1' }))).json()
    expect(body.data.mismatch).toEqual({ qonto: 1100, app: 1200 })
  })

  it('clé Qonto sans droits : message explicite', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(403, { message: 'forbidden' }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('QONTO_FORBIDDEN')
  })

  it('migration 028 absente : rien n’est envoyé à Qonto', async () => {
    const { qonto_quote_id: _q, qonto_client_id: _c, ...old } = DEVIS
    db.crm_devis = old
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('MIGRATION_028')
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('affaire sans contact : 400 explicite', async () => {
    db.crm_opportunites = { id: 'o1', contact_id: null }
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/contact/)
  })

  it('numbers : liste les numéros Qonto (pagination)', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(json(200, { quotes: [{ number: '26-049' }], meta: { next_page: 2 } }))
      .mockResolvedValueOnce(json(200, { quotes: [{ number: '26-048' }], meta: {} }))
    const body = await (await POST(req({ action: 'numbers' }))).json()
    expect(body.data.numbers).toEqual(['26-049', '26-048'])
  })

  it('numbers renvoie aussi les statuts Qonto (suivi)', async () => {
    fetchWithRetry.mockResolvedValueOnce(json(200, { quotes: [{ id: 'qq1', number: '26-050', status: 'approved' }], meta: {} }))
    const body = await (await POST(req({ action: 'numbers' }))).json()
    expect(body.data.quotes).toEqual([{ id: 'qq1', number: '26-050', status: 'approved' }])
  })

  it('pdf : récupère le PDF généré par Qonto (via la pièce jointe)', async () => {
    db.crm_devis = { ...DEVIS, qonto_quote_id: 'qq1' }
    const pdfBytes = Buffer.from('%PDF-1.4 qonto')
    fetchWithRetry
      .mockResolvedValueOnce(json(200, { quote: { id: 'qq1', number: '26-053', attachment_id: 'att1' } }))
      .mockResolvedValueOnce(json(200, { attachment: { url: 'https://s3.qonto/att1.pdf' } }))
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => pdfBytes })
    const res = await POST(req({ action: 'pdf', devisId: 'd1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(fetchWithRetry.mock.calls[2][0]).toBe('https://s3.qonto/att1.pdf')
    expect(fetchWithRetry.mock.calls[2][1].headers).toBeUndefined()
    expect(Buffer.from(body.data.base64, 'base64').toString()).toBe('%PDF-1.4 qonto')
    expect(body.data.filename).toBe('Devis 26-053.pdf')
  })

  it('pdf : pas encore généré par Qonto → PDF_UNAVAILABLE ; devis hors Qonto → NOT_IN_QONTO', async () => {
    db.crm_devis = { ...DEVIS, qonto_quote_id: 'qq1' }
    fetchWithRetry.mockResolvedValueOnce(json(200, { quote: { id: 'qq1', number: '26-053' } }))
    let res = await POST(req({ action: 'pdf', devisId: 'd1' }))
    expect((await res.json()).code).toBe('PDF_UNAVAILABLE')
    db.crm_devis = { ...DEVIS }
    res = await POST(req({ action: 'pdf', devisId: 'd1' }))
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_IN_QONTO')
  })

  it('Qonto non connecté, non-staff, action inconnue', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req({ action: 'numbers' }))).status).toBe(403)
    db.settings = null
    const res = await POST(req({ action: 'numbers' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('QONTO_NOT_CONFIGURED')
    db.settings = { value: 't' }
    expect((await POST(req({ action: 'x' }))).status).toBe(400)
  })
})
