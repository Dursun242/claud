/**
 * @jest-environment node
 */
// Tests de la route /api/admin/users (GET et POST).
//
// Logique non triviale à couvrir :
//  1. Lookup du caller par email pour vérifier son rôle
//  2. Auto-provisioning démo : email inconnu + demo_mode != 'off' → création
//     d'un compte client "DémoMOA" + log d'activité
//  3. Réactivation automatique d'un compte DémoMOA désactivé qui revient
//  4. User non-admin : ne reçoit que son propre profil (pas de leak)
//  5. Admin : reçoit la liste complète
//  6. POST : validation de l'email, des rôles, réservé aux admins

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/app/lib/auth', () => ({
  verifyAuth: jest.fn(),
}))

// eslint-disable-next-line import/first
import { GET, POST } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { createClient } from '@supabase/supabase-js'

// Fabrique un faux client Supabase "admin" avec un router par table.
// Chaque table reçoit une factory qui prend les paramètres de la query
// (via la chaîne d'appels) et renvoie un résultat.
function makeAdminClient(tableHandlers) {
  const from = jest.fn((table) => {
    const handler = tableHandlers[table]
    if (!handler) throw new Error(`Table non mockée : ${table}`)
    return handler()
  })
  return { from }
}

// Helper : chaîne "select → eq → maybeSingle" (lecture d'un profil unique)
function selectMaybeSingle(result) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  }
}
// Helper : chaîne "select → eq → single"
function selectSingle(result) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  }
}
// Helper : chaîne "select → order" (liste complète)
function selectOrder(result) {
  return {
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  }
}
// Helper : chaîne "insert → select → single" (création)
function insertSingle(result) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  }
}
// Helper : chaîne "upsert → select → single"
function upsertSingle(result) {
  return {
    upsert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  }
}
// Helper : chaîne "insert" terminal avec .then() chaîné (activity_logs fait
// `.insert(...).then(...)`). On retourne une thenable qui résout tout de suite.
function insertThen() {
  const p = Promise.resolve({ data: null, error: null })
  return {
    insert: jest.fn().mockReturnValue({
      then: (onFulfilled, onRejected) => p.then(onFulfilled, onRejected),
    }),
  }
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
  // Forcer la clé service role à être présente pour passer le garde-fou
  // (si absente, getAdminClient throw et la route répond 500).
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  verifyAuth.mockReset()
  createClient.mockReset()
})

describe('GET /api/admin/users', () => {
  it('renvoie 401 si le caller n\'est pas authentifié', async () => {
    verifyAuth.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it("non-admin ne voit QUE son propre profil (pas de leak de la liste)", async () => {
    verifyAuth.mockResolvedValue({ email: 'bob@acme.com' })
    const bob = { id: 'u-bob', email: 'bob@acme.com', role: 'salarie', actif: true, prenom: 'Bob', nom: '', }
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => selectMaybeSingle({ data: bob, error: null }),
      settings: () => selectMaybeSingle({ data: { value: 'off' }, error: null }),
    }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data).toEqual([bob])
  })

  it('admin reçoit la liste complète triée par prénom', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@acme.com' })
    const admin = { id: 'u-admin', email: 'admin@acme.com', role: 'admin', actif: true, prenom: 'Alice', nom: '' }
    const fullList = [admin, { id: 'u2', email: 'bob@acme.com', role: 'salarie' }]
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => {
        // Premier appel : lookup caller (maybeSingle) ; second : liste (order)
        let calls = 0
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockImplementation(() => {
            calls++
            return Promise.resolve({ data: admin, error: null })
          }),
          order: jest.fn().mockResolvedValue({ data: fullList, error: null }),
        }
      },
      settings: () => selectMaybeSingle({ data: { value: 'off' }, error: null }),
    }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual(fullList)
  })

  it("auto-provisioning DémoMOA si email inconnu + demo_mode != 'off'", async () => {
    verifyAuth.mockResolvedValue({ email: 'prospect@maison.com', app_metadata: { provider: 'google' } })

    const createdUser = { id: 'u-demo', email: 'prospect@maison.com', role: 'client', actif: true, prenom: 'DémoMOA', nom: 'Prospect' }

    // 1er lookup caller : null (inconnu) ; après insert le caller prend la
    // valeur createdUser (toujours maybeSingle). Pour ce test la route
    // n'enchaîne pas sur un autre maybeSingle après création — elle
    // renvoie directement [caller].
    const authUsers = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: createdUser, error: null }),
    }
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => authUsers,
      settings: () => selectMaybeSingle({ data: { value: 'on' }, error: null }),
      activity_logs: () => insertThen(),
    }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()

    // Le prospect est créé et renvoyé comme seule entrée (rôle = client non admin)
    expect(json.data).toEqual([createdUser])
    // L'insert a bien été appelé avec le bon shape démo
    expect(authUsers.insert).toHaveBeenCalledWith(expect.objectContaining({
      email: 'prospect@maison.com',
      prenom: 'DémoMOA',
      role: 'client',
      actif: true,
    }))
  })

  it("PAS d'auto-provisioning quand demo_mode = 'off'", async () => {
    verifyAuth.mockResolvedValue({ email: 'nobody@nowhere.com' })

    const authUsers = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn(), // ne doit PAS être appelé
    }
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => authUsers,
      settings: () => selectMaybeSingle({ data: { value: 'off' }, error: null }),
    }))

    const res = await GET(makeRequest({ token: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([]) // pas de caller, pas de liste
    expect(authUsers.insert).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users', () => {
  it('refuse un non-admin avec 403', async () => {
    verifyAuth.mockResolvedValue({ email: 'bob@acme.com' })
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => selectSingle({ data: { role: 'salarie' }, error: null }),
    }))

    const res = await POST(makeRequest({ token: 't', body: { email: 'x@x.fr', prenom: 'X' } }))
    expect(res.status).toBe(403)
  })

  it("refuse un email invalide avec 400", async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@acme.com' })
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => selectSingle({ data: { role: 'admin' }, error: null }),
    }))

    const res = await POST(makeRequest({ token: 't', body: { email: 'pas-un-email', prenom: 'X' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Email/)
  })

  it('refuse un rôle non whitelisté avec 400', async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@acme.com' })
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => selectSingle({ data: { role: 'admin' }, error: null }),
    }))

    const res = await POST(makeRequest({ token: 't', body: { email: 'x@x.fr', prenom: 'X', role: 'superadmin' } }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Rôle/)
  })

  it("upsert le user avec email+prenom trim et rôle 'salarie' par défaut", async () => {
    verifyAuth.mockResolvedValue({ email: 'admin@acme.com' })
    const created = { id: 'u1', email: 'new@x.fr', prenom: 'New', nom: '', role: 'salarie', actif: true }
    const upsertSpy = jest.fn()
    // Le `from('authorized_users')` est appelé 2x par la route (lookup
    // caller + upsert). On renvoie un nouveau chain-stub par appel et on
    // distingue les deux par la présence ou non d'un upsert dans la chaîne.
    createClient.mockReturnValue(makeAdminClient({
      authorized_users: () => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          upsert: (...args) => {
            upsertSpy(...args)
            // Après un upsert, single() doit retourner le user créé.
            chain.single = jest.fn().mockResolvedValue({ data: created, error: null })
            return chain
          },
          single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
        }
        return chain
      },
    }))

    const res = await POST(makeRequest({ token: 't', body: { email: '  NEW@x.fr  ', prenom: '  New  ' } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data).toEqual(created)
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@x.fr',
        prenom: 'New',
        role: 'salarie',
        actif: true,
      }),
      expect.objectContaining({ onConflict: 'email' })
    )
  })
})
