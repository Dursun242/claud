/** @jest-environment node */
// Tests pour /api/google-tasks/sync.
// Couvre :
//   - 401 si ni JWT admin ni cron secret
//   - 200 si JWT admin
//   - 200 si cron secret
//   - skipped si Google pas connecté
//   - bootstrap au 1er passage (last_full_sync_at null)
//   - pas de bootstrap si déjà sync
//   - import / update / delete depuis Google

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/googleTasks', () => ({
  getOAuthState: jest.fn(),
  saveOAuthState: jest.fn(),
  ensureTasksList: jest.fn(),
  listTasks: jest.fn(),
  insertTask: jest.fn(),
  tacheToGoogleTask: jest.fn((t) => ({ title: t.titre, status: 'needsAction' })),
  googleTaskToTachePatch: jest.fn((g) => ({
    titre: g.title,
    statut: g.status === 'completed' ? 'fait' : 'a_faire',
    google_task_id: g.id,
    google_etag: g.etag,
    synced_at: 'NOW',
    echeance: null,
  })),
}))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

const { POST } = require('../route')
const { verifyAuth } = require('@/app/lib/auth')
const { adminClient } = require('@/app/lib/supabaseClients')
const gt = require('@/app/lib/googleTasks')

function makeRequest({ token, body }) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

// Helper : construit un mock supabase customisable par table.
function supabaseMock({ authorizedRole = 'admin', orphans = [], chantiers = [], existingByGoogleId = {} } = {}) {
  const recorded = { inserted: [], updated: [], deleted: [] }
  const builders = {
    authorized_users: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: jest.fn().mockResolvedValue({ data: authorizedRole ? { role: authorizedRole } : null }),
        }),
      }),
    }),
    taches: () => {
      // Suit la chaîne d'appels utilisée dans la route.
      const builder = {
        select: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: orphans }),
        eq: jest.fn(function (col, val) {
          // For .eq('google_task_id', x).maybeSingle() during pull
          this._eq = { col, val }
          return this
        }),
        maybeSingle: jest.fn(function () {
          if (this._eq?.col === 'google_task_id') {
            const row = existingByGoogleId[this._eq.val]
            return Promise.resolve({ data: row || null })
          }
          return Promise.resolve({ data: null })
        }),
        update: jest.fn(function (payload) {
          // chainable .eq after .update
          return {
            eq: jest.fn(async (col, val) => {
              recorded.updated.push({ payload, [col]: val })
              return { data: null }
            }),
          }
        }),
        insert: jest.fn(async (payload) => {
          recorded.inserted.push(payload)
          return { data: null }
        }),
        delete: jest.fn(function () {
          return {
            eq: jest.fn(async (col, val) => {
              recorded.deleted.push({ [col]: val })
              return { data: null }
            }),
          }
        }),
      }
      return builder
    },
    chantiers: () => ({
      select: () => ({
        in: jest.fn().mockResolvedValue({ data: chantiers }),
      }),
    }),
    google_oauth_state: () => ({
      update: () => ({ eq: jest.fn().mockResolvedValue({ data: null }) }),
    }),
  }
  return {
    from: jest.fn((t) => builders[t]?.() || { update: () => ({ eq: jest.fn().mockResolvedValue({}) }) }),
    _recorded: recorded,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/google-tasks/sync', () => {
  it('renvoie 401 si ni JWT admin ni cron secret', async () => {
    verifyAuth.mockResolvedValue(null)
    delete process.env.GOOGLE_TASKS_CRON_SECRET

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('renvoie 401 si JWT mais user non-admin', async () => {
    verifyAuth.mockResolvedValue({ email: 'salarie@x.fr' })
    adminClient.mockReturnValue(supabaseMock({ authorizedRole: 'salarie' }))

    const res = await POST(makeRequest({ token: 'jwt' }))
    expect(res.status).toBe(401)
  })

  it('accepte le cron secret', async () => {
    verifyAuth.mockResolvedValue(null)
    process.env.GOOGLE_TASKS_CRON_SECRET = 'topsecret'
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: '2026-01-01T00:00:00Z' })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.listTasks.mockResolvedValue({ items: [], nextPageToken: null })
    adminClient.mockReturnValue(supabaseMock())

    const res = await POST(makeRequest({ token: 'topsecret' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.source).toBe('cron')
  })

  it('renvoie skipped si Google pas connecté', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    adminClient.mockReturnValue(supabaseMock({ authorizedRole: 'admin' }))
    gt.getOAuthState.mockResolvedValue(null)

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.skipped).toBe('not-connected')
  })

  it('bootstrap au 1er passage : pousse les taches sans google_task_id', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: null })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.insertTask.mockResolvedValue({ id: 'g-created', etag: '"e"' })
    gt.listTasks.mockResolvedValue({ items: [], nextPageToken: null })

    adminClient.mockReturnValue(supabaseMock({
      orphans: [{ id: 't1', titre: 'A', statut: 'a_faire', chantier_id: 'c1' }],
      chantiers: [{ id: 'c1', nom: 'Villa' }],
    }))

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(gt.insertTask).toHaveBeenCalledTimes(1)
    expect(json.bootstrap.pushed).toBe(1)
  })

  it('pas de bootstrap si déjà sync', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: '2026-01-01T00:00:00Z' })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.listTasks.mockResolvedValue({ items: [], nextPageToken: null })
    adminClient.mockReturnValue(supabaseMock())

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.bootstrap).toBeNull()
    expect(gt.insertTask).not.toHaveBeenCalled()
  })

  it('IMPORT : tâche Google sans correspondance → INSERT Supabase', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: '2026-01-01T00:00:00Z' })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.listTasks.mockResolvedValue({
      items: [{ id: 'g-new', title: 'Nouveau', status: 'needsAction', etag: '"e"' }],
      nextPageToken: null,
    })
    const supa = supabaseMock({ existingByGoogleId: {} })
    adminClient.mockReturnValue(supa)

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.pull.imported).toBe(1)
    expect(json.pull.updated).toBe(0)
    expect(supa._recorded.inserted.length).toBe(1)
  })

  it('UPDATE : tâche Google avec correspondance → UPDATE Supabase', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: '2026-01-01T00:00:00Z' })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.listTasks.mockResolvedValue({
      items: [{ id: 'g-known', title: 'Modifié', status: 'completed', etag: '"e2"' }],
      nextPageToken: null,
    })
    const supa = supabaseMock({ existingByGoogleId: { 'g-known': { id: 't-local' } } })
    adminClient.mockReturnValue(supa)

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.pull.updated).toBe(1)
    expect(json.pull.imported).toBe(0)
  })

  it('DELETE : tâche Google deleted=true → DELETE Supabase si trouvée', async () => {
    verifyAuth.mockResolvedValue({ email: 'dursun@x.fr' })
    gt.getOAuthState.mockResolvedValue({ id: 1, last_full_sync_at: '2026-01-01T00:00:00Z' })
    gt.ensureTasksList.mockResolvedValue('L1')
    gt.listTasks.mockResolvedValue({
      items: [{ id: 'g-deleted', deleted: true }],
      nextPageToken: null,
    })
    const supa = supabaseMock({ existingByGoogleId: { 'g-deleted': { id: 't-doomed' } } })
    adminClient.mockReturnValue(supa)

    const res = await POST(makeRequest({ token: 'jwt' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.pull.deleted).toBe(1)
    expect(supa._recorded.deleted).toEqual([{ id: 't-doomed' }])
  })
})
