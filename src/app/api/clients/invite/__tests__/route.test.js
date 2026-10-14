/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(() => ({ from: 'contact@idm.fr' })), sendMail: jest.fn(), smtpErrorMessage: (e) => e.message }))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { sendMail } from '@/app/lib/mailer'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const CH = '11111111-1111-4111-8111-111111111111'
const req = (body) => ({ url: 'https://app.test/api/clients/invite', headers: { get: () => null }, json: async () => body })
let db, authUsers
beforeEach(() => {
  jest.clearAllMocks()
  verifyStaff.mockResolvedValue({ user: { email: 'moe@idm.fr' }, status: 200 })
  db = memoryDb({
    chantiers: [{ id: CH, nom: 'Mosquée Maryam', client: 'Havre De Savoir', client_user_id: null }],
    authorized_users: [{ id: 'a1', email: 'moe@idm.fr', role: 'admin', actif: true }],
  })
  authUsers = []
  db.client.auth = { admin: { listUsers: async () => ({ data: { users: authUsers }, error: null }) } }
  adminClient.mockReturnValue(db.client)
})

describe('/api/clients/invite', () => {
  it('nouveau client : compte autorisé, adresse sur le chantier, invitation envoyée', async () => {
    const res = await (await POST(req({ chantierId: CH, email: ' Havre@Gmail.com ', envoyer: true }))).json()
    expect(res).toEqual({ ok: true, linked: false, invited: true })
    expect(db.tables.authorized_users[1]).toMatchObject({ email: 'havre@gmail.com', prenom: 'Havre', nom: 'De Savoir', role: 'client', actif: true })
    expect(db.tables.chantiers[0]).toMatchObject({ client_email: 'havre@gmail.com', client_user_id: null })
    const mail = sendMail.mock.calls[0][1]
    expect(mail.to).toBe('havre@gmail.com')
    expect(mail.text).toContain('https://app.test')
    expect(mail.html).toContain('Suivre mon chantier')
  })

  it('client déjà connecté une fois : chantier rattaché tout de suite, sans mail si non demandé', async () => {
    authUsers = [{ id: 'u-9', email: 'havre@gmail.com' }]
    db.tables.authorized_users.push({ id: 'a2', email: 'havre@gmail.com', role: 'client', actif: false, prenom: 'DémoMOA' })
    const res = await (await POST(req({ chantierId: CH, email: 'havre@gmail.com' }))).json()
    expect(res).toEqual({ ok: true, linked: true, invited: false })
    expect(db.tables.chantiers[0].client_user_id).toBe('u-9')
    expect(db.tables.authorized_users[1]).toMatchObject({ actif: true, prenom: 'Havre' })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('refuse une adresse de l’équipe, une adresse invalide, un non-membre', async () => {
    expect((await POST(req({ chantierId: CH, email: 'moe@idm.fr' }))).status).toBe(409)
    expect((await POST(req({ chantierId: CH, email: 'x' }))).status).toBe(400)
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(req({ chantierId: CH, email: 'a@gmail.com' }))).status).toBe(403)
  })
})
