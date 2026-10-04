/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(), sendMail: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { smtpConfig, sendMail } from '@/app/lib/mailer'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const call = (qs = '', auth = 'Bearer s3cret') => GET({ url: `https://app.test/api/cron/conformite${qs}`, headers: { get: (k) => (k === 'authorization' ? auth : null) } })
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

let db
beforeEach(() => {
  process.env.CRON_SECRET = 's3cret'
  process.env.APP_URL = 'https://app.test'
  smtpConfig.mockReturnValue({ from: 'moe@id.fr', notify: 'moe@id.fr', transport: {} })
  sendMail.mockResolvedValue({})
  db = memoryDb({
    chantiers: [{ id: 'ch1', statut: 'En cours' }, { id: 'ch2', statut: 'Terminé' }],
    ordres_service: [
      { chantier_id: 'ch1', artisan_nom: 'Costa Plomberie', statut: 'Envoyé' },
      { chantier_id: 'ch1', artisan_nom: 'Nouveau Peintre', statut: 'Envoyé' },
      { chantier_id: 'ch2', artisan_nom: 'Ancien Maçon', statut: 'Envoyé' },
    ],
    contacts: [
      { id: 'c1', nom: 'Costa Plomberie', type: 'Artisan', email: 'costa@ex.fr' },
      { id: 'c2', nom: 'Nouveau Peintre', type: 'Artisan', email: 'peintre@ex.fr' },
      { id: 'c3', nom: 'Ancien Maçon', type: 'Artisan', email: 'macon@ex.fr' },
    ],
    contact_chantiers: [],
    contact_documents: [
      { id: 'd1', contact_id: 'c1', kind: 'urssaf', valide_au: inDays(5), anomalies: [], created_at: '2026-04-01' },
      { id: 'd2', contact_id: 'c3', kind: 'urssaf', valide_au: inDays(-5), anomalies: [], created_at: '2026-04-01' },
    ],
    contact_doc_requests: [],
  })
  adminClient.mockReturnValue(db.client)
})

describe('/api/cron/conformite', () => {
  it('protégée par CRON_SECRET', async () => {
    expect((await call('', 'Bearer non')).status).toBe(401)
  })

  it('relance chaque semaine les entreprises sur un chantier en cours (manquant, expirant)', async () => {
    const dry = await (await call('?dry=1')).json()
    // c3 n'est plus sur un chantier en cours
    expect(dry.entreprises).toEqual(['Costa Plomberie', 'Nouveau Peintre'])
    expect(sendMail).not.toHaveBeenCalled()

    const res = await (await call()).json()
    expect(res).toEqual({ ok: true, sent: 2, failed: 0, controles: 0 })
    expect(sendMail.mock.calls.map(c => c[1].to)).toEqual(['costa@ex.fr', 'peintre@ex.fr'])
    expect(sendMail.mock.calls[0][1].subject).not.toMatch(/^Rappel/)
    expect(sendMail.mock.calls[0][1].text).toMatch(/https:\/\/app\.test\/deposer\/[a-f0-9]{48}/)
    expect(db.tables.contact_doc_requests[0]).toMatchObject({ contact_id: 'c1', auto: true, envois: 1 })

    // Le lendemain : déjà relancées il y a moins de 7 jours → rien
    expect((await (await call('?dry=1')).json()).entreprises).toEqual([])

    // Une semaine plus tard : rappel
    db.tables.contact_doc_requests.forEach(r => { r.dernier_envoi = new Date(Date.now() - 8 * 86_400_000).toISOString() })
    sendMail.mockClear()
    expect(await (await call()).json()).toEqual({ ok: true, sent: 2, failed: 0, controles: 0 })
    expect(sendMail.mock.calls[0][1].subject).toMatch(/^Rappel/)
  })

  it('suspension : générale (aucun envoi) ou par entreprise', async () => {
    db.tables.settings = [{ key: 'conformite_relances_pause', value: 'on' }]
    expect(await (await call()).json()).toEqual({ ok: true, skipped: 'relances suspendues', controles: 0 })
    expect(sendMail).not.toHaveBeenCalled()
    db.tables.settings = [{ key: 'conformite_relances_pause', value: 'off' }]
    db.tables.contacts[1].relances_suspendues = true
    expect((await (await call('?dry=1')).json()).entreprises).toEqual(['Costa Plomberie'])
  })

  it('migration absente : ignoré sans erreur', async () => {
    db = memoryDb({}, { errors: { contact_documents: { code: '42P01', message: 'relation "contact_documents" does not exist' } } })
    adminClient.mockReturnValue(db.client)
    expect(await (await call()).json()).toEqual({ ok: true, skipped: 'migration 036 non appliquée' })
  })
})
