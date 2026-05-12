/** @jest-environment node */
// Tests pour /api/google-tasks/push.
// Couvre :
//   - 401 si pas authentifié
//   - no-op skipped si Google pas connecté
//   - upsert INSERT (pas de google_task_id)
//   - upsert PATCH (google_task_id existant)
//   - delete avec ID
//   - delete sans ID (no-op)

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/googleTasks', () => ({
  getOAuthState: jest.fn(),
  insertTask: jest.fn(),
  patchTask: jest.fn(),
  deleteTaskGoogle: jest.fn(),
  tacheToGoogleTask: jest.fn((t) => ({ title: t.titre, status: 'needsAction' })),
}))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

const { POST } = require('../route')
const { verifyAuth } = require('@/app/lib/auth')
const { adminClient } = require('@/app/lib/supabaseClients')
const gt = require('@/app/lib/googleTasks')

function makeRequest({ token = 't', body }) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

function chainOk(returnData) {
  // Mock générique pour adminClient().from().update().eq() etc.
  const m = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: returnData, error: null }),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: returnData, error: null }),
  }
  return { from: jest.fn().mockReturnValue(m), _m: m }
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyAuth.mockResolvedValue({ id: 'u1', email: 'dursun@id-maitrise.fr' })
})

describe('POST /api/google-tasks/push', () => {
  it('renvoie 401 si pas authentifié', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: { action: 'upsert', tache: { id: 't1' } } }))
    expect(res.status).toBe(401)
  })

  it('renvoie skipped si Google pas connecté', async () => {
    gt.getOAuthState.mockResolvedValue(null)
    const res = await POST(makeRequest({ body: { action: 'upsert', tache: { id: 't1' } } }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.skipped).toBe('not-connected')
  })

  it('INSERT si pas de google_task_id', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1, tasks_list_id: 'L1' })
    gt.insertTask.mockResolvedValue({ id: 'g-new', etag: '"e1"' })
    adminClient.mockReturnValue(chainOk({}).from === undefined ? chainOk({}) : chainOk({}))

    const res = await POST(makeRequest({
      body: { action: 'upsert', tache: { id: 't1', titre: 'X', statut: 'a_faire' } },
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(gt.insertTask).toHaveBeenCalledTimes(1)
    expect(gt.patchTask).not.toHaveBeenCalled()
    expect(json.googleTaskId).toBe('g-new')
  })

  it('PATCH si google_task_id présent', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })
    gt.patchTask.mockResolvedValue({ id: 'g-existing', etag: '"e2"' })
    adminClient.mockReturnValue(chainOk({}))

    const res = await POST(makeRequest({
      body: {
        action: 'upsert',
        tache: { id: 't1', titre: 'X', statut: 'fait', google_task_id: 'g-existing' },
      },
    }))
    expect(res.status).toBe(200)
    expect(gt.patchTask).toHaveBeenCalledWith('g-existing', expect.any(Object))
    expect(gt.insertTask).not.toHaveBeenCalled()
  })

  it('si PATCH renvoie 404 (tâche supprimée côté Google), retombe en INSERT', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })
    const err404 = new Error('Not Found'); err404.status = 404
    gt.patchTask.mockRejectedValue(err404)
    gt.insertTask.mockResolvedValue({ id: 'g-recreated', etag: '"e3"' })
    adminClient.mockReturnValue(chainOk({}))

    const res = await POST(makeRequest({
      body: {
        action: 'upsert',
        tache: { id: 't1', titre: 'X', statut: 'a_faire', google_task_id: 'g-gone' },
      },
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(gt.patchTask).toHaveBeenCalledTimes(1)
    expect(gt.insertTask).toHaveBeenCalledTimes(1)
    expect(json.googleTaskId).toBe('g-recreated')
  })

  it('DELETE supprime côté Google si google_task_id présent', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })
    gt.deleteTaskGoogle.mockResolvedValue(null)

    const res = await POST(makeRequest({
      body: { action: 'delete', tache: { id: 't1', google_task_id: 'g-X' } },
    }))
    expect(res.status).toBe(200)
    expect(gt.deleteTaskGoogle).toHaveBeenCalledWith('g-X')
  })

  it('DELETE no-op si pas de google_task_id', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })

    const res = await POST(makeRequest({
      body: { action: 'delete', tache: { id: 't1' } },
    }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.skipped).toBe('no-google-id')
    expect(gt.deleteTaskGoogle).not.toHaveBeenCalled()
  })

  it('DELETE ignore le 404 Google (déjà supprimée)', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })
    const err404 = new Error('Not Found'); err404.status = 404
    gt.deleteTaskGoogle.mockRejectedValue(err404)

    const res = await POST(makeRequest({
      body: { action: 'delete', tache: { id: 't1', google_task_id: 'g-gone' } },
    }))
    expect(res.status).toBe(200)
  })

  it('renvoie 400 si action invalide', async () => {
    gt.getOAuthState.mockResolvedValue({ id: 1 })
    const res = await POST(makeRequest({ body: { action: 'foo' } }))
    expect(res.status).toBe(400)
  })
})
