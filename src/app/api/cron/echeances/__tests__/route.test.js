/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/conformiteServer', () => ({ todayParis: () => '2026-10-13' }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(() => ({ from: 'contact@idm.fr' })), sendMail: jest.fn() }))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { sendMail } from '@/app/lib/mailer'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const req = (q = '') => ({ url: `https://app.test/api/cron/echeances${q}`, headers: { get: (h) => (h === 'authorization' ? 'Bearer s3cret' : null) } })

let db
beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  // Mardi 13 octobre 2026 : échéances des 14 et 15 rappelées
  jest.useFakeTimers({ now: new Date('2026-10-13T06:40:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
  db = memoryDb({
    chantiers: [{ id: 'ch', nom: 'Villa Dupont', statut: 'En cours' }],
    taches: [
      { id: 't1', chantier_id: 'ch', titre: 'Reprendre l’enduit', entreprise: 'Leroy Plâtrerie', statut: 'En cours', num_point: 4, echeance: '2026-10-15' },
      { id: 't2', chantier_id: 'ch', titre: 'Évacuer les gravats', entreprise: 'Leroy Plâtrerie', statut: 'En cours', num_point: 2, echeance: '2026-10-14' },
      { id: 't3', chantier_id: 'ch', titre: 'Plus tard', entreprise: 'Leroy Plâtrerie', statut: 'En cours', echeance: '2026-10-30' },
      { id: 't4', chantier_id: 'ch', titre: 'Sans adresse', entreprise: 'Inconnu', statut: 'En cours', echeance: '2026-10-14' },
    ],
    compte_rendus: [{ chantier_id: 'ch', numero: 3, intervenants: [{ nom: 'Paul', societe: 'Leroy Plâtrerie', email: 'paul@leroy.fr' }] }],
    contacts: [],
    cr_liens: [],
  })
  adminClient.mockReturnValue(db.client)
})
afterEach(() => jest.useRealTimers())

describe('/api/cron/echeances', () => {
  it('un mail par entreprise avec le lien de réponse, rappel noté une fois par échéance', async () => {
    const res = await (await GET(req())).json()
    expect(res).toMatchObject({ ok: true, sent: 1, failed: 0, sansEmail: 1 })
    const mail = sendMail.mock.calls[0][1]
    expect(mail.to).toBe('paul@leroy.fr')
    expect(mail.subject).toBe('Rappel : 2 actions attendues — Villa Dupont')
    expect(mail.text).toContain('n°4 Reprendre l’enduit — pour le 15/10/2026')
    expect(mail.text).toMatch(/https:\/\/app\.test\/actions\/[a-f0-9]{64}/)
    expect(mail.html).toContain('Répondre sur mes actions')
    expect(db.tables.taches.find(t => t.id === 't1').rappel_echeance).toBe('2026-10-15')
    expect(db.tables.taches.find(t => t.id === 't3').rappel_echeance).toBeUndefined()
    sendMail.mockClear()
    expect((await (await GET(req())).json()).sent).toBe(0)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('?dry=1 : liste sans envoyer ; secret requis', async () => {
    const res = await (await GET(req('?dry=1'))).json()
    expect(res.due).toEqual([{ chantier: 'Villa Dupont', entreprise: 'Leroy Plâtrerie', to: 'paul@leroy.fr', actions: ['Reprendre l’enduit', 'Évacuer les gravats'] }])
    expect(res.sansEmail).toEqual(['Inconnu'])
    expect(sendMail).not.toHaveBeenCalled()
    expect((await GET({ url: 'https://app.test/api/cron/echeances', headers: { get: () => 'Bearer faux' } })).status).toBe(401)
  })
})
