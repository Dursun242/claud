/**
 * @jest-environment node
 */
let GET, db, updates, inserts, sendMail, listQuotes

const SECRET = 's3cret-cron'

function fakeAdmin() {
  return {
    from(table) {
      const q = { table }
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        not: () => b,
        update: (patch) => { q.patch = patch; updates.push({ table, patch }); return b },
        insert: async (rows) => { inserts.push({ table, rows }); return { error: null } },
        maybeSingle: async () => ({ data: table === 'settings' ? { value: db.token } : db[table], error: null }),
        then: (res) => {
          if (table === 'authorized_users') return res({ data: db.staff, error: null })
          if (table === 'crm_devis' && q.patch) return res({ data: db.alreadyDone ? [] : [{ id: 'x' }], error: null })
          return res({ data: db.crm_devis, error: null })
        },
      }
      return b
    },
  }
}

const req = (auth = `Bearer ${SECRET}`) => ({ headers: { get: (h) => (h === 'authorization' ? auth : null) } })

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.resetModules()
  process.env.CRON_SECRET = SECRET
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  listQuotes = jest.fn()
  jest.doMock('@/app/lib/qontoServer', () => ({
    getQontoToken: async (admin) => (await admin.from('settings').select('value').eq('key', 'qonto-token').maybeSingle()).data?.value || null,
    listQuotes,
  }))
  sendMail = jest.fn().mockResolvedValue({})
  jest.doMock('@/app/lib/mailer', () => ({
    smtpConfig: () => ({ transport: {}, from: 'contact@id-maitrise.com', notify: 'contact@id-maitrise.com' }),
    sendMail,
  }))
  ;({ GET } = require('../route'))
  updates = []; inserts = []
  db = {
    token: 'login:secret',
    staff: [{ email: 'admin@id-maitrise.com', role: 'admin', actif: true }],
    crm_devis: [
      { id: 'd1', numero: 'D-2026-040', objet: 'Garage', statut: 'Envoyé', opportunite_id: 'o1', total_ht: 5000, total_ttc: 6000, qonto_quote_id: 'q1' },
      { id: 'd2', numero: 'D-2026-041', objet: 'Toiture', statut: 'Envoyé', opportunite_id: 'o2', total_ht: 1000, total_ttc: 1200, qonto_quote_id: 'q2' },
      { id: 'd3', numero: 'D-2026-042', objet: 'Déjà traité', statut: 'Accepté', opportunite_id: 'o3', total_ht: 1, total_ttc: 1, qonto_quote_id: 'q3' },
      { id: 'd4', numero: 'D-2026-043', objet: 'En attente', statut: 'Brouillon', opportunite_id: 'o4', total_ht: 1, total_ttc: 1, qonto_quote_id: 'q4' },
    ],
    crm_opportunites: { id: 'o1', titre: 'Garage Martin', etape: 'Devis envoyé' },
  }
  listQuotes.mockResolvedValue([
    { id: 'q1', status: 'approved' }, { id: 'q2', status: 'canceled' },
    { id: 'q3', status: 'approved' }, { id: 'q4', status: 'pending_approval' },
  ])
})
afterEach(() => { delete process.env.CRON_SECRET; jest.restoreAllMocks() })

describe('/api/cron/qonto-status', () => {
  it('refuse sans le bon secret ; 503 si CRON_SECRET absent', async () => {
    expect((await GET(req('Bearer mauvais'))).status).toBe(401)
    expect((await GET(req(null))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(req())).status).toBe(503)
    expect(listQuotes).not.toHaveBeenCalled()
  })

  it('accepté / annulé dans Qonto → CRM mis à jour et équipe prévenue', async () => {
    const body = await (await GET(req())).json()
    expect(body).toMatchObject({ ok: true, checked: 3 })
    expect(body.changes).toEqual([{ numero: 'D-2026-040', statut: 'Accepté' }, { numero: 'D-2026-041', statut: 'Refusé' }])
    expect(listQuotes).toHaveBeenCalledWith('login:secret')

    const devisUpd = updates.filter(u => u.table === 'crm_devis').map(u => u.patch.statut)
    expect(devisUpd).toEqual(['Accepté', 'Refusé'])
    expect(updates.find(u => u.table === 'crm_opportunites').patch).toMatchObject({ etape: 'Gagné', probabilite: 100, montant_estime: 5000 })

    const notifs = inserts.filter(i => i.table === 'notifications').flatMap(i => i.rows)
    expect(notifs.map(n => n.title)).toEqual(['✅ Devis D-2026-040 accepté dans Qonto', '❌ Devis D-2026-041 annulé dans Qonto'])
    expect(notifs[0]).toMatchObject({ recipient_email: 'admin@id-maitrise.com', entity_type: 'devis', entity_id: 'd1', target_tab: 'crm' })
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[0][1]).toMatchObject({ to: 'contact@id-maitrise.com', subject: '✅ Devis D-2026-040 accepté dans Qonto' })
    expect(sendMail.mock.calls[0][1].text).toMatch(/Affaire : Garage Martin/)
  })

  it('pas de double notification si le devis a déjà été mis à jour', async () => {
    db.alreadyDone = true
    const body = await (await GET(req())).json()
    expect(body.changes).toEqual([])
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('rien à faire sans Qonto connecté ; erreur Qonto → 500', async () => {
    db.token = null
    expect(await (await GET(req())).json()).toMatchObject({ ok: true, checked: 0 })
    db.token = 'login:secret'
    listQuotes.mockRejectedValueOnce(new Error('Qonto 401'))
    expect((await GET(req())).status).toBe(500)
  })
})
