/**
 * @jest-environment node
 */
// createNotifications : destinataires résolus côté serveur (service role),
// staff actif + compte client MOA rattaché au chantier (client_user_id),
// jamais les inactifs.

jest.mock('../supabaseClients', () => ({ adminClient: jest.fn() }))

// eslint-disable-next-line import/first
import { createNotifications } from '../notifications'
// eslint-disable-next-line import/first
import { adminClient } from '../supabaseClients'

const USERS = [
  { email: 'Admin@IDM.fr', prenom: 'Alice', nom: 'Martin', role: 'admin', actif: true },
  { email: 'sal@idm.fr', prenom: 'Bob', nom: '', role: 'salarié', actif: true },
  { email: 'dupont@client.fr', prenom: 'Jean', nom: 'Dupont', role: 'client', actif: true },
  { email: 'autre@client.fr', prenom: 'Paul', nom: 'Autre', role: 'client', actif: true },
]

const AUTH_USERS = { 'u-dupont': 'Dupont@Client.fr' }

function makeAdmin({ chantier = { nom: 'Villa Dupont', client: 'Jean', client_user_id: 'u-dupont' } } = {}) {
  const insert = jest.fn().mockResolvedValue({ error: null })
  const from = jest.fn((table) => {
    if (table === 'notifications') return { insert }
    if (table === 'chantiers') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: chantier }) }) }) }
    }
    if (table === 'authorized_users') {
      return {
        select: () => ({
          // .eq('actif', true) → liste des actifs (destinataires)
          eq: async () => ({ data: USERS.filter(u => u.actif) }),
          // .ilike('email', …) → profil de l'acteur
          ilike: async (_c, email) => ({ data: USERS.filter(u => u.email.toLowerCase() === email) }),
        }),
      }
    }
    throw new Error('table inattendue ' + table)
  })
  const getUserById = jest.fn(async (id) => ({ data: { user: AUTH_USERS[id] ? { email: AUTH_USERS[id] } : null } }))
  adminClient.mockReturnValue({ from, auth: { admin: { getUserById } } })
  return { insert }
}

beforeEach(() => jest.clearAllMocks())

describe('createNotifications', () => {
  it('notifie le staff actif et le client du chantier, avec le nom de l’acteur', async () => {
    const { insert } = makeAdmin()
    await createNotifications({
      entityType: 'pv', entityId: 'pv1', chantierId: 'c1', action: 'update',
      data: { numero: 'PV-1' }, actorEmail: 'ADMIN@idm.fr',
    })
    const rows = insert.mock.calls[0][0]
    expect(rows.map(r => r.recipient_email).sort()).toEqual(['admin@idm.fr', 'dupont@client.fr', 'sal@idm.fr'])
    expect(rows[0].title).toMatch(/sur Villa Dupont — par Alice Martin \(admin\)$/)
    expect(rows[0]).toMatchObject({ actor_email: 'admin@idm.fr', kind: 'update', chantier_id: 'c1', entity_id: 'pv1' })
  })

  it('chantier non rattaché à un compte : pas de client, même si le prénom correspond', async () => {
    const { insert } = makeAdmin({ chantier: { nom: 'Villa Dupont', client: 'Jean', client_user_id: null } })
    await createNotifications({ entityType: 'os', entityId: 'o', chantierId: 'c1', data: {} })
    expect(insert.mock.calls[0][0].map(r => r.recipient_email).sort()).toEqual(['admin@idm.fr', 'sal@idm.fr'])
  })

  it('sans chantier : seulement le staff', async () => {
    const { insert } = makeAdmin()
    await createNotifications({ entityType: 'chantier', entityId: 'x', data: { nom: 'N' } })
    expect(insert.mock.calls[0][0].map(r => r.recipient_email).sort()).toEqual(['admin@idm.fr', 'sal@idm.fr'])
  })

  it('ignore les chantiers de démonstration', async () => {
    makeAdmin()
    await createNotifications({ entityType: 'os', entityId: 'o', chantierId: '11111111-1111-4111-8111-111111111d01' })
    expect(adminClient).not.toHaveBeenCalled()
  })

  it('ne lève jamais (erreur Supabase journalisée seulement)', async () => {
    adminClient.mockImplementation(() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant') })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(createNotifications({ entityType: 'os', entityId: 'o' })).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
