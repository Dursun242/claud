/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(), sendMail: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/devisNotify', () => ({ notifyTeam: jest.fn() }))
jest.mock('@/app/lib/conformiteServer', () => ({ todayParis: () => '2026-10-12' }))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { smtpConfig, sendMail } from '@/app/lib/mailer'
// eslint-disable-next-line import/first
import { notifyTeam } from '@/app/lib/devisNotify'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const call = (qs = '', auth = 'Bearer s3cret') => GET({ url: `https://app.test/api/cron/reprise${qs}`, headers: { get: (k) => (k === 'authorization' ? auth : null) } })
const attente = { etape: 'En attente', reprise_auto: true, reprise_token: null, reprise_envoyee_le: null, motif_attente: 'Projet reporté' }

let db
beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 's3cret'
  smtpConfig.mockReturnValue({ from: 'contact@id-maitrise.com', notify: 'contact@id-maitrise.com', transport: {} })
  sendMail.mockResolvedValue({})
  db = memoryDb({
    crm_opportunites: [
      { ...attente, id: 'o1', titre: 'Maison Leroy', contact_id: 'c1', date_reprise: '2026-10-10' },
      { ...attente, id: 'o2', titre: 'Extension Bernard', contact_id: 'c1', date_reprise: '2026-11-01' },
      { ...attente, id: 'o3', titre: 'Sans mail', contact_id: 'c2', date_reprise: '2026-10-01' },
      { ...attente, id: 'o4', titre: 'Désactivée', contact_id: 'c1', date_reprise: '2026-10-01', reprise_auto: false },
    ],
    contacts: [{ id: 'c1', nom: 'M. Leroy', email: 'leroy@ex.fr' }, { id: 'c2', nom: 'Sans mail', email: null }],
    crm_interactions: [
      { id: 'i1', opportunite_id: 'o1', prochaine_action: 'Reprendre contact (affaire en attente)', prochaine_action_date: '2026-10-10', action_faite: false },
    ],
  })
  adminClient.mockReturnValue(db.client)
})

describe('/api/cron/reprise', () => {
  it('protégée par CRON_SECRET', async () => {
    expect((await call('', 'Bearer non')).status).toBe(401)
  })

  it('dry : liste les mails à envoyer sans rien envoyer', async () => {
    const res = await call('?dry=1')
    const j = await res.json()
    expect(j.due.map(d => d.id)).toEqual(['o1'])
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('envoie le mail de reprise, note le suivi et prévient l’équipe', async () => {
    const j = await (await call()).json()
    expect(j).toMatchObject({ ok: true, sent: 1, failed: 0 })
    const mail = sendMail.mock.calls[0][1]
    expect(mail).toMatchObject({ to: 'leroy@ex.fr', subject: 'Où en est votre projet ?' })
    expect(mail.replyTo).toBeUndefined()
    const opp = db.tables.crm_opportunites.find(o => o.id === 'o1')
    expect(opp.reprise_envoyee_le).toBe('2026-10-12')
    expect(opp.reprise_token).toMatch(/^[a-f0-9]{64}$/)
    expect(mail.text).toContain(`https://app.test/reprise/${opp.reprise_token}`)
    expect(mail.html).toContain(`/reprise/${opp.reprise_token}?r=redemarre`)
    // Ancien rappel soldé, nouveau rappel à J+14
    expect(db.tables.crm_interactions.find(i => i.id === 'i1').action_faite).toBe(true)
    expect(db.tables.crm_interactions.find(i => i.id !== 'i1')).toMatchObject({
      opportunite_id: 'o1', prochaine_action_date: '2026-10-26', action_faite: false,
    })
    expect(notifyTeam).toHaveBeenCalledTimes(1)
    // Un seul mail par date de reprise
    await call()
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it('échec d’envoi : rien n’est noté, l’affaire sera retentée', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ECONNECTION' }))
    const j = await (await call()).json()
    expect(j).toMatchObject({ sent: 0, failed: 1 })
    expect(db.tables.crm_opportunites.find(o => o.id === 'o1').reprise_envoyee_le).toBeNull()
    expect(notifyTeam).not.toHaveBeenCalled()
  })
})
