/**
 * @jest-environment node
 */
let GET, POST, db, inserts, notifyTeam, closeDevisFollowUps

const TOKEN = 'd'.repeat(64)

function fakeAdmin() {
  return {
    from(table) {
      const q = { filters: [] }
      const b = {
        select: () => b, order: () => b,
        eq: (k, v) => { q.filters.push([k, v]); return b },
        gte: () => b,
        limit: async () => ({ data: table === 'crm_devis_events' ? db.events : [] }),
        insert: async (row) => { inserts.push({ table, row }); return { error: null } },
        maybeSingle: async () => ({
          data: table === 'crm_devis' ? (q.filters.some(([k, v]) => k === 'track_token' && v === TOKEN) ? db.devis : null) : db[table] || null,
          error: null,
        }),
      }
      return b
    },
  }
}

const req = ({ url = `https://app.test/api/devis/reponse?t=${TOKEN}`, body } = {}) => ({
  url, headers: { get: (h) => ({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'Firefox' })[h] || null }, json: async () => body,
})

beforeEach(() => {
  jest.resetModules()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  notifyTeam = jest.fn().mockResolvedValue()
  jest.doMock('@/app/lib/devisNotify', () => ({ notifyTeam }))
  closeDevisFollowUps = jest.fn().mockResolvedValue(1)
  jest.doMock('@/app/lib/devisWon', () => ({ closeDevisFollowUps }))
  inserts = []
  db = {
    devis: { id: 'd1', numero: '26-050', objet: 'Extension', statut: 'Envoyé', opportunite_id: 'o1' },
    crm_opportunites: { titre: 'Extension Martin', contact_id: 'ct1' },
    events: [],
  }
  ;({ GET, POST } = require('../route'))
})

describe('/api/devis/reponse (page publique)', () => {
  it('GET : devis et choix, sans rien enregistrer', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toMatchObject({ numero: '26-050', objet: 'Extension', derniere: null })
    expect(data.raisons).toHaveLength(10)
    expect(inserts).toEqual([])
  })

  it('GET : dernière réponse déjà donnée', async () => {
    db.events = [{ detail: { raison: 'rdv', commentaire: 'mardi' }, created_at: '2026-10-02T08:00:00Z' }]
    const { data } = await (await GET(req())).json()
    expect(data.derniere).toEqual({ raison: 'rdv', commentaire: 'mardi', created_at: '2026-10-02T08:00:00Z' })
  })

  it('jeton inconnu ou mal formé : 404', async () => {
    expect((await GET(req({ url: `https://app.test/api/devis/reponse?t=${'e'.repeat(64)}` }))).status).toBe(404)
    expect((await POST(req({ body: { t: 'abc', raison: 'budget' } }))).status).toBe(404)
  })

  it('POST : réponse enregistrée, relances soldées, suite dans le CRM, équipe prévenue', async () => {
    const res = await POST(req({ body: { t: TOKEN, raison: 'budget', commentaire: 'Plutôt 4 000 €' } }))
    expect(res.status).toBe(200)
    expect(inserts.find(i => i.table === 'crm_devis_events').row).toMatchObject({
      devis_id: 'd1', kind: 'reponse', ip: '1.2.3.4', detail: { raison: 'budget', commentaire: 'Plutôt 4 000 €' },
    })
    expect(closeDevisFollowUps).toHaveBeenCalledWith(expect.anything(), db.devis, expect.anything())
    expect(inserts.find(i => i.table === 'crm_interactions').row).toMatchObject({
      opportunite_id: 'o1', contact_id: 'ct1', sujet: 'Réponse du client au devis 26-050 : Budget dépassé',
      contenu: '« Plutôt 4 000 € »', prochaine_action: 'Rappeler le client (budget)', action_faite: false,
    })
    const n = notifyTeam.mock.calls[0][1]
    expect(n.title).toBe('💬 Devis 26-050 : Budget dépassé')
    expect(n.body).toBe('Extension Martin · « Plutôt 4 000 € »')
    expect(n.mailLines).toContain('Réponse : Le montant dépasse le budget que j’avais prévu')
  })

  it('POST : « Autre » sans précision refusé', async () => {
    const res = await POST(req({ body: { t: TOKEN, raison: 'autre', commentaire: '' } }))
    expect(res.status).toBe(400)
    expect(inserts).toEqual([])
  })
})
