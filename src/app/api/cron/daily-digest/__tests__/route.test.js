/**
 * @jest-environment node
 */
let GET, db, sendMail, generate, smtp, writes

const SECRET = 's3cret-cron'
const DEMO_ID = '11111111-1111-4111-8111-111111111d01'
const KEY = 'daily_digest_last_sent'

// Lundi 5 octobre 2026 : heure d'été (UTC+2) → 05:25 UTC = 7 h 25 à Paris
const MONDAY_SUMMER_7H = '2026-10-05T05:25:00Z'

// Client Supabase factice : lectures par table, table settings tenue à jour
// (insert / update / delete conditionnels) pour vérifier l'anti-doublon.
function fakeAdmin() {
  return {
    from(table) {
      const q = { table, op: 'select', filters: [] }
      const run = () => {
        if (table === 'settings') {
          const match = () => db.settings !== undefined && q.filters.every(([k, v]) => (k === 'key' ? v === KEY : db.settings === v))
          if (q.op === 'insert') {
            if (db.settings !== undefined) return { data: null, error: { code: '23505', message: 'duplicate key' } }
            db.settings = q.row.value; writes.push(['insert', q.row.value])
            return { data: null, error: null }
          }
          if (q.op === 'update') {
            if (!match()) return { data: [], error: null }
            db.settings = q.patch.value; writes.push(['update', q.patch.value])
            return { data: [{ key: KEY }], error: null }
          }
          if (q.op === 'delete') {
            if (match()) { db.settings = undefined; writes.push(['delete']) }
            return { data: null, error: null }
          }
          return { data: db.settings === undefined ? null : { value: db.settings }, error: null }
        }
        if (db.errors?.[table]) return { data: null, error: { message: db.errors[table] } }
        return { data: db[table] || [], error: null }
      }
      const b = {
        select: () => b, order: () => b, limit: () => b, or: () => b,
        eq: (k, v) => { q.filters.push([k, v]); return b },
        is: (k, v) => { q.filters.push([k, v]); return b },
        insert: (row) => { q.op = 'insert'; q.row = row; return b },
        update: (patch) => { q.op = 'update'; q.patch = patch; return b },
        delete: () => { q.op = 'delete'; return b },
        maybeSingle: async () => run(),
        then: (ok, ko) => Promise.resolve(run()).then(ok, ko),
      }
      return b
    },
  }
}

const req = ({ auth = `Bearer ${SECRET}`, query = '' } = {}) => ({
  url: `https://app.example.fr/api/cron/daily-digest${query}`,
  headers: { get: (h) => (h === 'authorization' ? auth : null) },
})

const at = (iso) => jest.useFakeTimers({
  now: new Date(iso),
  doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
})

const call = async (opts) => {
  const res = await GET(req(opts))
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.resetModules()
  process.env.CRON_SECRET = SECRET
  process.env.APP_URL = 'https://claud.example.fr'
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  sendMail = jest.fn().mockResolvedValue({})
  smtp = { transport: {}, from: 'contact@id-maitrise.com', notify: 'contact@id-maitrise.com' }
  jest.doMock('@/app/lib/mailer', () => ({
    smtpConfig: () => smtp,
    sendMail,
    smtpErrorMessage: jest.requireActual('@/app/lib/mailer').smtpErrorMessage,
  }))
  generate = jest.fn().mockResolvedValue({ ok: true, text: '**Commence** par le carrelage de la maison Dupont.', provider: 'anthropic' })
  jest.doMock('@/app/lib/ai', () => ({ generate }))
  ;({ GET } = require('../route'))
  writes = []
  db = {
    settings: '2026-10-02',
    authorized_users: [
      { email: 'Admin@ID-maitrise.com', role: 'admin', actif: true },
      { email: 'paul@id-maitrise.com', role: 'salarié', actif: true },
      { email: 'admin@id-maitrise.com', role: 'admin', actif: true }, // doublon
      { email: 'ancien@id-maitrise.com', role: 'salarie', actif: false },
      { email: 'client@exemple.fr', role: 'client', actif: true },
      { email: null, role: 'admin', actif: true },
    ],
    chantiers: [
      { id: 'ch1', nom: 'Maison <Dupont>', statut: 'En cours' },
      { id: DEMO_ID, nom: 'Villa Moreau (démo)', statut: 'En cours', is_demo: true },
    ],
    taches: [
      { id: 't1', titre: 'Commander <carrelage> & joints', statut: 'En cours', priorite: 'Urgent', echeance: '2026-10-01', chantier_id: 'ch1' },
      { id: 't2', titre: 'Appeler le plombier', statut: 'Planifié', echeance: '2026-10-05', chantier_id: 'ch1' },
      { id: 't3', titre: 'Vérifier la toiture', statut: 'Planifié', echeance: '2026-10-02', chantier_id: 'ch1' },
      { id: 't4', titre: 'Déjà fait', statut: 'Terminé', echeance: '2026-09-01', chantier_id: 'ch1' },
      { id: 'td', titre: 'Tâche de démo', statut: 'Planifié', priorite: 'Urgent', echeance: '2026-09-20', chantier_id: DEMO_ID },
    ],
    ordres_service: [
      { id: 'os1', numero: 'OS-12', artisan_nom: 'Costa', statut_signature: 'Envoyé', chantier_id: 'ch1' },
      { id: 'osd', numero: 'DEMO-REN-002', artisan_nom: 'Costa Plomberie', statut_signature: 'Envoyé', chantier_id: DEMO_ID },
    ],
    contacts: [],
    planning: [{ id: 'pd', lot: 'Démo', tache: 'Phase démo', debut: '2026-10-05', fin: '2026-10-20', avancement: 0, chantier_id: DEMO_ID }],
    rdv: [{ id: 'rd', titre: 'Visite démo', date: '2026-10-05', heure: '10:00', chantier_id: DEMO_ID }],
    crm_opportunites: [{ id: 'o1', titre: 'Extension Martin', etape: 'Qualifié', created_at: '2026-10-01' }],
    crm_interactions: [{ id: 'i1', opportunite_id: 'o1', type: 'Appel', sujet: 'Premier contact', date: '2026-10-01', prochaine_action: 'Rappeler M. Martin', prochaine_action_date: '2026-10-03', action_faite: false }],
    crm_devis: [],
    crm_devis_events: [],
  }
  at(MONDAY_SUMMER_7H)
})
afterEach(() => {
  jest.useRealTimers()
  delete process.env.CRON_SECRET
  delete process.env.APP_URL
  jest.restoreAllMocks()
})

describe('/api/cron/daily-digest', () => {
  it('refuse sans le bon secret ; 503 si CRON_SECRET absent', async () => {
    expect((await call({ auth: 'Bearer mauvais' })).status).toBe(401)
    expect((await call({ auth: null })).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await call()).status).toBe(503)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('503 explicite si le SMTP n’est pas configuré', async () => {
    smtp = null
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(body.code).toBe('EMAIL_NOT_CONFIGURED')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('hors créneau : envoi seulement entre 7 h et 9 h 59 à Paris (été comme hiver)', async () => {
    at('2026-10-05T08:25:00Z') // 10 h 25 à Paris (heure d'été)
    expect((await call()).body).toEqual({ ok: true, skipped: 'hors créneau' })
    at('2026-11-02T05:25:00Z') // lundi, 6 h 25 à Paris (heure d'hiver)
    expect((await call()).body).toEqual({ ok: true, skipped: 'hors créneau' })
    expect(sendMail).not.toHaveBeenCalled()
    at('2026-11-02T06:25:00Z') // lundi, 7 h 25 à Paris (heure d'hiver)
    expect((await call()).body).toMatchObject({ ok: true, sent: 2, failed: 0 })
  })

  it('cron GitHub en retard : l’envoi part encore à 8 h 40 à Paris', async () => {
    at('2026-10-05T06:40:00Z') // lundi, 8 h 40 à Paris (heure d'été)
    expect((await call()).body).toMatchObject({ ok: true, sent: 2, failed: 0 })
  })

  it('week-end : pas d’envoi, même à 7 h', async () => {
    at('2026-10-03T05:25:00Z') // samedi 7 h 25 à Paris
    expect((await call()).body).toEqual({ ok: true, skipped: 'hors créneau' })
    at('2026-10-04T05:25:00Z') // dimanche
    expect((await call()).body).toEqual({ ok: true, skipped: 'hors créneau' })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('force=1 : envoi manuel hors créneau (toujours protégé par le secret)', async () => {
    at('2026-10-03T14:00:00Z') // samedi après-midi
    expect((await call({ query: '?force=1', auth: 'Bearer mauvais' })).status).toBe(401)
    const { body } = await call({ query: '?force=1' })
    expect(body).toMatchObject({ ok: true, sent: 2 })
    expect(db.settings).toBe('2026-10-03')
  })

  it('anti-doublon : déjà envoyé aujourd’hui → rien ne part, même avec force=1', async () => {
    db.settings = '2026-10-05'
    expect((await call()).body).toEqual({ ok: true, skipped: 'déjà envoyé aujourd’hui' })
    expect((await call({ query: '?force=1' })).body).toEqual({ ok: true, skipped: 'déjà envoyé aujourd’hui' })
    expect(sendMail).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('anti-doublon : la date est enregistrée, un second appel le même jour n’envoie rien', async () => {
    expect((await call()).body).toMatchObject({ ok: true, sent: 2 })
    expect(writes).toEqual([['update', '2026-10-05']])
    expect((await call()).body).toEqual({ ok: true, skipped: 'déjà envoyé aujourd’hui' })
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('première exécution (pas de ligne settings) : la ligne est créée', async () => {
    delete db.settings
    expect((await call()).body).toMatchObject({ ok: true, sent: 2 })
    expect(writes).toEqual([['insert', '2026-10-05']])
  })

  it('rien à signaler : pas de mail ni d’appel IA', async () => {
    db.taches = db.taches.filter(t => t.chantier_id === DEMO_ID || t.statut === 'Terminé')
    db.ordres_service = []
    db.crm_interactions = []
    db.crm_opportunites = []
    expect((await call()).body).toEqual({ ok: true, skipped: 'rien à signaler' })
    expect(sendMail).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('envoi nominal : un mail par membre actif de l’équipe, avec le mot du jour', async () => {
    const { body } = await call()
    expect(body).toMatchObject({ ok: true, sent: 2, failed: 0, mot: true })
    expect(sendMail.mock.calls.map(c => c[1].to)).toEqual(['admin@id-maitrise.com', 'paul@id-maitrise.com'])
    expect(generate).toHaveBeenCalledTimes(1)
    const ai = generate.mock.calls[0][0]
    expect(ai.system).toMatch(/maître d'œuvre BTP/)
    expect(ai.messages[0].content).toMatch(/^Mes priorités du jour :\n1\. Commander <carrelage> & joints — Urgente, en retard de 4 jours/)

    const mail = sendMail.mock.calls[0][1]
    expect(mail.subject).toBe('Vos priorités du lundi 5 octobre — 5 points')
    expect(sendMail.mock.calls[1][1].subject).toBe(mail.subject)
    // Mot du jour nettoyé (sans Markdown), dans le texte et le HTML
    expect(mail.text).toContain('Commence par le carrelage de la maison Dupont.')
    expect(mail.html).toContain('Commence par le carrelage de la maison Dupont.')
    // Top 3 numéroté : titre, raison, chantier
    expect(mail.text).toContain('1. Commander <carrelage> & joints\n   Urgente, en retard de 4 jours\n   Maison <Dupont>')
    expect(mail.text).toContain('2. Vérifier la toiture\n   En retard de 3 jours\n   Maison <Dupont>')
    expect(mail.text).toContain('3. Rappeler M. Martin\n   Relance prévue il y a 2 jours\n   Extension Martin · Premier contact')
    // Puis « Également à traiter »
    expect(mail.text).toContain('Également à traiter :\n- Appeler le plombier — À faire aujourd\'hui\n- OS-12 — Costa — OS envoyé')
    expect(mail.html).toContain('Également à traiter')
    // Lien vers le tableau de bord
    expect(mail.text).toContain('Ouvrir le tableau de bord : https://claud.example.fr')
    expect(mail.html).toContain('href="https://claud.example.fr"')
  })

  it('même liste que le tableau de bord (assemblage partagé)', async () => {
    const { buildDailyPriorities } = require('@/app/lib/dailyPriorities')
    const { mapCriticalData, mapSecondaryData } = require('@/app/lib/dashboardData')
    const { _demoIds, ...critical } = mapCriticalData({ chantiers: db.chantiers, taches: db.taches, ordresService: db.ordres_service })
    const data = { ...critical, ...mapSecondaryData({ contacts: [], planning: db.planning, rdv: db.rdv }, _demoIds) }
    const crm = { opportunites: db.crm_opportunites, interactions: db.crm_interactions, devis: [], devisEvents: [] }
    const { priorities } = buildDailyPriorities({ data, crm, today: '2026-10-05', nowHM: '07:25', now: new Date('2026-10-05T12:00:00Z') })
    await call()
    const text = sendMail.mock.calls[0][1].text
    priorities.top.forEach((p, i) => expect(text).toContain(`${i + 1}. ${p.title}`))
    expect(priorities.total).toBe(5)
  })

  it('documents des entreprises : une entreprise active dont la décennale a expiré figure dans le mail', async () => {
    db.contacts = [{ id: 'c1', nom: 'Costa', type: 'Artisan' }]
    db.contact_documents = [{ id: 'd1', contact_id: 'c1', kind: 'decennale', valide_au: '2026-09-30', anomalies: [], created_at: '2026-01-01' }]
    db.contact_chantiers = []
    await call()
    expect(sendMail.mock.calls[0][1].text).toContain('Documents — Costa')
  })

  it('documents des entreprises : sans la migration 036, le mail part comme avant', async () => {
    db.errors = { contact_documents: 'relation "contact_documents" does not exist' }
    const { body } = await call()
    expect(body).toMatchObject({ ok: true, sent: 2 })
  })

  it('IA en échec : le mail part sans la phrase', async () => {
    generate.mockResolvedValueOnce({ ok: false, status: 503, message: 'Service IA momentanément surchargé' })
    const { body } = await call()
    expect(body).toMatchObject({ ok: true, sent: 2, mot: false })
    const mail = sendMail.mock.calls[0][1]
    expect(mail.text.split('\n')[0]).toBe('Vos priorités du lundi 5 octobre')
    expect(mail.text.split('\n')[1]).toBe('')
    expect(mail.text.split('\n')[2]).toBe('1. Commander <carrelage> & joints')
    expect(mail.html).not.toContain('font-style:italic')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('IA qui lève : le mail part quand même', async () => {
    generate.mockRejectedValueOnce(new Error('réseau'))
    expect((await call()).body).toMatchObject({ ok: true, sent: 2, mot: false })
  })

  it('échappe tout texte injecté dans le HTML', async () => {
    generate.mockResolvedValueOnce({ ok: true, text: 'Va voir <script>alert(1)</script> chez Dupont' })
    await call()
    const { html } = sendMail.mock.calls[0][1]
    expect(html).toContain('Commander &lt;carrelage&gt; &amp; joints')
    expect(html).toContain('Maison &lt;Dupont&gt;')
    // Mot du jour : Markdown retiré (dont « > »), le reste échappé
    expect(html).toContain('Va voir &lt;scriptalert(1)&lt;/script chez Dupont')
    expect(html).not.toContain('<carrelage>')
    expect(html).not.toContain('<Dupont>')
    expect(html).not.toContain('<script')
  })

  it('chantiers de démo exclus (tâches, OS, phases, rendez-vous)', async () => {
    await call()
    const { text, html, subject } = sendMail.mock.calls[0][1]
    for (const s of ['Tâche de démo', 'DEMO-REN-002', 'Phase démo', 'Visite démo', 'Villa Moreau']) {
      expect(text).not.toContain(s)
      expect(html).not.toContain(s)
    }
    expect(subject).toMatch(/— 5 points$/)
  })

  it('un destinataire en échec : journalisé, les autres reçoivent le mail', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('refusé'), { code: 'EENVELOPE' }))
    const { body } = await call()
    expect(body).toMatchObject({ ok: true, sent: 1, failed: 1 })
    expect(console.warn).toHaveBeenCalled()
    expect(db.settings).toBe('2026-10-05')
  })

  it('tous les envois en échec : 502 et la journée est libérée pour un nouvel essai', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('auth'), { code: 'EAUTH' }))
    const { status, body } = await call()
    expect(status).toBe(502)
    expect(body).toMatchObject({ ok: false, sent: 0, failed: 2 })
    expect(body.error).toMatch(/Identifiants refusés/)
    expect(db.settings).toBe('2026-10-02')
  })

  it('aucun destinataire : rien n’est envoyé ni enregistré', async () => {
    db.authorized_users = [{ email: 'client@exemple.fr', role: 'client', actif: true }]
    expect((await call()).body).toEqual({ ok: true, skipped: 'aucun destinataire' })
    expect(writes).toEqual([])
  })

  it('table illisible : 500, pas de mail partiel', async () => {
    db.errors = { taches: 'timeout' }
    expect((await call()).status).toBe(500)
    expect(sendMail).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })
})
