/**
 * @jest-environment node
 */
let POST, verifyStaff, fetchWithRetry, db, updates, inserts = []

const DEVIS = {
  id: 'd1', opportunite_id: 'o1', numero: 'PROV-ABC', statut: 'Brouillon', objet: 'Escalier',
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
        insert: (row) => { q.insert = row; inserts.push({ table, row }); return b },
        maybeSingle: async () => ({ data: db[table], error: null }),
        single: async () => {
          if (q.insert) return { data: { id: table === 'crm_opportunites' ? 'opp-new' : 'new' }, error: null }
          updates.push({ table, patch: q.patch })
          if (q.patch?.numero && db.numeroConflict) return { data: null, error: { code: '23505', message: 'dup' } }
          return { data: { ...db[table], ...q.patch }, error: null }
        },
        then: (res) => res(q.insert ? { error: null } : { data: db.lists?.[table] ?? db.rows ?? [], error: null }),
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
  it('crée le client puis le devis sans numéro ; le CRM reprend le numéro Qonto', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(json(200, { clients: [], meta: {} }))
      .mockResolvedValueOnce(json(201, { client: { id: 'qc1' } }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-054', quote_url: 'https://q/1', total_amount: { value: '1200.00' } } }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(calls()).toEqual(['GET /clients?per_page=100&page=1', 'POST /clients', 'POST /quotes'])
    const [, quoteOpts] = fetchWithRetry.mock.calls[2]
    expect(quoteOpts.headers.Authorization).toBe('login:secret')
    expect(quoteOpts.maxRetries).toBe(0)
    const sent = JSON.parse(quoteOpts.body)
    expect(sent).toMatchObject({ client_id: 'qc1', items: [{ vat_rate: '0.2' }] })
    expect(sent.number).toBeUndefined()
    expect(updates[0].patch).toMatchObject({ numero: '26-054', qonto_quote_id: 'qq1', qonto_client_id: 'qc1', qonto_url: 'https://q/1' })
    expect(updates[0].patch.qonto_hash).toBeTruthy()
    expect(body.data).toMatchObject({ created: true, qontoNumber: '26-054', mismatch: null, renumbered: '26-054', numberConflict: null })
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

  it('Qonto exige un numéro : le CRM continue la séquence de Qonto', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry
      .mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/number' }, detail: "can't be blank" }] }))
      .mockResolvedValueOnce(json(200, { quotes: [{ number: '26-060' }, { number: '26-061' }], meta: {} }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-062' } }))
    const body = await (await POST(req({ action: 'sync', devisId: 'd1' }))).json()
    expect(JSON.parse(fetchWithRetry.mock.calls[2][1].body).number).toBe('26-062')
    expect(body.data.renumbered).toBe('26-062')
  })

  it('numéro refusé par Qonto : 409 NUMBER_TAKEN, rien d’enregistré', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/number' }, detail: 'has already been taken' }] }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('NUMBER_TAKEN')
    expect(updates).toEqual([])
  })

  it('numéro Qonto déjà pris par un autre devis du CRM : lien gardé, conflit signalé', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    db.numeroConflict = true
    fetchWithRetry.mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: '26-054' } }))
    const body = await (await POST(req({ action: 'sync', devisId: 'd1' }))).json()
    expect(updates[1].patch).toMatchObject({ qonto_quote_id: 'qq1' })
    expect(updates[1].patch.numero).toBeUndefined()
    expect(body.data.numberConflict).toBe('26-054')
  })

  it('Qonto exige le SIREN : complété depuis la fiche contact puis devis renvoyé', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    db.contacts = { ...db.contacts, siret: '921 536 181 00024' }
    fetchWithRetry
      .mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/customer/tin_number' }, detail: '`tin_number` must have a value' }] }))
      .mockResolvedValueOnce(json(200, { client: { id: 'qc1' } }))
      .mockResolvedValueOnce(json(201, { quote: { id: 'qq1', number: 'D-2026-033' } }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    expect(res.status).toBe(200)
    expect(calls()).toEqual(['POST /quotes', 'PATCH /clients/qc1', 'POST /quotes'])
    expect(JSON.parse(fetchWithRetry.mock.calls[1][1].body)).toEqual({ tax_identification_number: '921536181' })
  })

  it('Qonto exige le SIREN mais la fiche contact n’en a pas : message clair', async () => {
    db.crm_devis = { ...DEVIS, qonto_client_id: 'qc1' }
    fetchWithRetry.mockResolvedValueOnce(json(422, { errors: [{ source: { pointer: '/customer/tin_number' }, detail: '`tin_number` must have a value' }] }))
    const res = await POST(req({ action: 'sync', devisId: 'd1' }))
    const body = await res.json()
    expect(res.status).toBe(422)
    expect(body.code).toBe('CLIENT_TIN_MISSING')
    expect(body.error).toMatch(/SIRET de la fiche contact « Jean Dupont »/)
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

  it('numbers renvoie aussi les statuts Qonto (suivi) et les unités utilisées', async () => {
    fetchWithRetry.mockResolvedValueOnce(json(200, { quotes: [
      { id: 'qq1', number: '26-050', status: 'approved', items: [{ unit: 'forfait' }, { unit: 'heure' }, { unit: null }] },
      { id: 'qq2', number: '26-051', status: 'pending_approval', items: [{ unit: 'heure' }, { unit: 'm²' }] },
    ], meta: {} }))
    const body = await (await POST(req({ action: 'numbers' }))).json()
    expect(body.data.quotes[0]).toEqual({ id: 'qq1', number: '26-050', status: 'approved' })
    expect(body.data.units).toEqual(['forfait', 'heure', 'm²'])
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

  it('import : crée affaire + devis pour les devis Qonto absents du CRM, ignore ceux déjà liés', async () => {
    db.lists = { crm_devis: [{ qonto_quote_id: 'qq-deja' }], crm_opportunites: [], contacts: [{ id: 'c1', nom: 'Jean Dupont', email: 'jean@exemple.fr' }] }
    inserts = []
    fetchWithRetry.mockResolvedValueOnce(json(200, { quotes: [
      { id: 'qq-deja', number: 'D-1', items: [] },
      { id: 'qq-new', number: 'D-2026-020', status: 'pending_approval', issue_date: '2026-09-01', expiry_date: '2026-10-01',
        client: { id: 'qc9', email: 'jean@exemple.fr' },
        items: [{ title: 'Études', quantity: '1', unit: 'forfait', unit_price: { value: '1000.00' }, vat_rate: '0.2' }] },
    ], meta: {} }))
    const body = await (await POST(req({ action: 'import' }))).json()
    expect(body.data).toEqual({ imported: 1, conflicts: [] })
    const opp = inserts.find(i => i.table === 'crm_opportunites').row
    expect(opp).toMatchObject({ etape: 'Devis envoyé', qonto_quote_id: 'qq-new', contact_id: 'c1', created_by: 'moe@id-maitrise.com' })
    const devis = inserts.find(i => i.table === 'crm_devis').row
    expect(devis).toMatchObject({ numero: 'D-2026-020', statut: 'Envoyé', opportunite_id: 'opp-new', qonto_quote_id: 'qq-new', qonto_client_id: 'qc9', total_ttc: 1200 })
    expect(devis.qonto_hash).toBeTruthy()
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
