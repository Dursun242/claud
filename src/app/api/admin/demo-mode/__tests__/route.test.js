/**
 * @jest-environment node
 */
// Tests de la route /api/admin/demo-mode.
//
// GET : retourne { enabled: bool } — lecture du flag settings.demo_mode.
// POST : toggle (admin only), upsert + log d'activité.

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))

// eslint-disable-next-line import/first
import { GET, POST } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { createClient } from '@supabase/supabase-js'

// Stub du client Supabase avec router par table.
function makeAdminClient({ callerRole, settingsValue = 'off', upsertError = null } = {}) {
  const upsertSpy = jest.fn().mockResolvedValue({ error: upsertError })
  const insertSpy = jest.fn().mockResolvedValue({ error: null })
  const from = jest.fn((table) => {
    if (table === 'authorized_users') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: callerRole ? { role: callerRole } : null,
          error: null,
        }),
      }
    }
    if (table === 'settings') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: settingsValue ? { value: settingsValue } : null,
          error: null,
        }),
        upsert: upsertSpy,
      }
    }
    if (table === 'activity_logs') {
      return { insert: insertSpy }
    }
    throw new Error(`Table non mockée : ${table}`)
  })
  return { from, _upsert: upsertSpy, _insert: insertSpy }
}

function makeRequest({ token, body } = {}) {
  const headers = new Map()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return {
    headers: { get: (n) => headers.get(n.toLowerCase()) ?? null },
    json: async () => body ?? {},
  }
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  verifyAuth.mockReset()
  createClient.mockReset()
  // Silence les console.error que la route émet en cas d'erreur (c'est
  // intentionnel, mais ça pollue la sortie jest).
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  console.error.mockRestore?.()
})

describe('GET /api/admin/demo-mode', () => {
  it('renvoie 401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('renvoie 403 pour un non-admin', async () => {
    verifyAuth.mockResolvedValue({ email: 'bob@x.fr' })
    createClient.mockReturnValue(makeAdminClient({ callerRole: 'salarie' }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(403)
  })

  it('renvoie { enabled: true } quand settings.demo_mode = "on"', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@x.fr' })
    createClient.mockReturnValue(makeAdminClient({ callerRole: 'admin', settingsValue: 'on' }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: true })
  })

  it('renvoie { enabled: false } quand le flag est absent ou != "on"', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@x.fr' })
    createClient.mockReturnValue(makeAdminClient({ callerRole: 'admin', settingsValue: null }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false })
  })
})

describe('POST /api/admin/demo-mode', () => {
  it('renvoie 403 pour un non-admin', async () => {
    verifyAuth.mockResolvedValue({ email: 'bob@x.fr' })
    createClient.mockReturnValue(makeAdminClient({ callerRole: 'salarie' }))

    const res = await POST(makeRequest({ token: 't', body: { enabled: true } }))
    expect(res.status).toBe(403)
  })

  it('upsert settings.demo_mode="on" + log d\'activité quand enabled=true', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@x.fr' })
    const client = makeAdminClient({ callerRole: 'admin' })
    createClient.mockReturnValue(client)

    const res = await POST(makeRequest({ token: 't', body: { enabled: true } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, enabled: true })

    expect(client._upsert).toHaveBeenCalledWith(
      { key: 'demo_mode', value: 'on' },
      expect.objectContaining({ onConflict: 'key' })
    )
    expect(client._insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update',
      entity_type: 'settings',
      entity_id: 'demo_mode',
      metadata: { enabled: true },
    }))
  })

  it('upsert settings.demo_mode="off" quand enabled=false', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@x.fr' })
    const client = makeAdminClient({ callerRole: 'admin' })
    createClient.mockReturnValue(client)

    const res = await POST(makeRequest({ token: 't', body: { enabled: false } }))
    expect(res.status).toBe(200)
    expect(client._upsert).toHaveBeenCalledWith(
      { key: 'demo_mode', value: 'off' },
      expect.anything()
    )
  })

  it('renvoie 500 si l\'upsert échoue', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@x.fr' })
    createClient.mockReturnValue(
      makeAdminClient({ callerRole: 'admin', upsertError: { message: 'Bad' } })
    )

    const res = await POST(makeRequest({ token: 't', body: { enabled: true } }))
    expect(res.status).toBe(500)
  })
})
