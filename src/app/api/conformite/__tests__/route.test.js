/**
 * @jest-environment node
 */
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/ai', () => ({ ...jest.requireActual('@/app/lib/ai'), generate: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(), sendMail: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))

// eslint-disable-next-line import/first
import { POST } from '../route'
// eslint-disable-next-line import/first
import { verifyStaff } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { generate } from '@/app/lib/ai'
// eslint-disable-next-line import/first
import { smtpConfig, sendMail } from '@/app/lib/mailer'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'
// eslint-disable-next-line import/first
import { docDisplayName } from '@/app/lib/devisDocuments'

const req = (body) => ({ url: 'https://app.test/api/conformite', headers: { get: () => 'Bearer t' }, json: async () => body })
const CONTACT = { id: 'c1', nom: 'Costa Plomberie', type: 'Artisan', specialite: 'Plomberie', siret: '55210055400013', email: 'costa@ex.fr' }
const aiJson = (o) => ({ ok: true, text: JSON.stringify({
  type_document: 'decennale', raison_sociale: '', siret: '', date_document: '', valide_du: '', valide_au: '',
  assureur: '', numero_police: '', activites: '', activite_couverte: 'inconnu', code_securite: '', anomalies: [], ...o,
}) })

let db
beforeEach(() => {
  db = memoryDb({ contacts: [{ ...CONTACT }], contact_documents: [], contact_doc_requests: [] })
  adminClient.mockReturnValue(db.client)
  verifyStaff.mockResolvedValue({ user: { id: 'u1' } })
  smtpConfig.mockReturnValue({ from: 'moe@id.fr', notify: 'moe@id.fr', transport: {} })
  sendMail.mockResolvedValue({})
  delete process.env.APP_URL
})

describe('/api/conformite', () => {
  it('réservé à l’équipe', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(req({ action: 'prepare' }))).status).toBe(403)
  })

  it('prepare : chemin propre à l’entreprise et au type, formats contrôlés', async () => {
    const res = await POST(req({ action: 'prepare', contactId: 'c1', kind: 'kbis', name: 'Kbis déc.pdf', type: '', size: 2e6 }))
    const { data } = await res.json()
    expect(data.path).toMatch(/^conformite\/c1\/kbis\/\d+__u-[A-Za-z0-9_-]+$/)
    expect(docDisplayName(data.path)).toBe('Kbis déc.pdf')
    expect(data).toMatchObject({ token: 'jeton-depot', type: 'application/pdf' })
    expect((await POST(req({ action: 'prepare', contactId: 'c1', kind: 'kbis', name: 'x.docx', size: 1 }))).status).toBe(400)
    expect((await (await POST(req({ action: 'prepare', contactId: 'c1', kind: 'kbis', name: 'IMG.HEIC', size: 1 }))).json()).error).toMatch(/HEIC/)
    expect((await POST(req({ action: 'prepare', contactId: 'c1', kind: 'kbis', name: 'a.pdf', size: 11e6 }))).status).toBe(400)
    expect((await POST(req({ action: 'prepare', contactId: 'c1', kind: 'autre', name: 'a.pdf', size: 1 }))).status).toBe(400)
    expect((await POST(req({ action: 'prepare', contactId: 'zz', kind: 'kbis', name: 'a.pdf', size: 1 }))).status).toBe(404)
  })

  it('register : lecture IA (PDF), contrôle du SIREN, mise à jour de l’assurance de la fiche', async () => {
    const path = 'conformite/c1/decennale/1__attestation.pdf'
    db.putFile(path)
    generate.mockResolvedValue(aiJson({ siret: '123456789', valide_du: '2026-01-01', valide_au: '2026-12-31', assureur: 'SMABTP', numero_police: 'P-12', activites: 'Plomberie' }))
    const res = await POST(req({ action: 'register', contactId: 'c1', kind: 'decennale', path, name: 'attestation.pdf' }))
    const { data } = await res.json()
    expect(data).toMatchObject({ kind: 'decennale', valide_au: '2026-12-31', lecture: 'auto', depose_par: 'equipe', assureur: 'SMABTP' })
    expect(data.anomalies[0]).toMatch(/SIREN du document \(123456789\)/)
    const sent = generate.mock.calls[0][0].messages[0].content[0]
    expect(sent).toMatchObject({ type: 'document', mediaType: 'application/pdf' })
    expect(db.tables.contacts[0]).toMatchObject({ assurance_validite: '2026-12-31', assurance_decennale: 'SMABTP – P-12' })
  })

  it('register : lecture impossible → enregistré, dates à saisir', async () => {
    const path = 'conformite/c1/urssaf/1__photo.jpg'
    db.putFile(path, 'jpeg', 'image/jpeg')
    generate.mockResolvedValue({ ok: false, status: 503, message: 'Service IA indisponible' })
    const { data } = await (await POST(req({ action: 'register', contactId: 'c1', kind: 'urssaf', path, name: 'photo.jpg' }))).json()
    expect(data).toMatchObject({ lecture: 'echec', valide_au: null })
    expect(data.anomalies[0]).toMatch(/saisissez les dates/)
  })

  it('register : refuse un fichier d’une autre entreprise ou d’un autre type', async () => {
    expect((await POST(req({ action: 'register', contactId: 'c1', kind: 'kbis', path: 'conformite/c2/kbis/1__a.pdf' }))).status).toBe(400)
    expect((await POST(req({ action: 'register', contactId: 'c1', kind: 'kbis', path: 'conformite/c1/urssaf/1__a.pdf' }))).status).toBe(400)
    expect((await POST(req({ action: 'register', contactId: 'c1', kind: 'kbis', path: 'conformite/c1/kbis/../../x' }))).status).toBe(400)
  })

  it('update : date saisie → fin calculée, « vérifié » efface les anomalies', async () => {
    db.tables.contact_documents.push({ id: 'd1', contact_id: 'c1', kind: 'urssaf', file_path: 'p', anomalies: ['illisible'], valide_au: null })
    const { data } = await (await POST(req({ action: 'update', id: 'd1', date_document: '2026-09-15', verifie: true }))).json()
    expect(data).toMatchObject({ date_document: '2026-09-15', valide_au: '2027-03-15', lecture: 'manuelle', anomalies: [] })
  })

  it('delete et url', async () => {
    db.putFile('conformite/c1/kbis/1__a.pdf')
    db.tables.contact_documents.push({ id: 'd1', contact_id: 'c1', kind: 'kbis', file_path: 'conformite/c1/kbis/1__a.pdf' })
    expect((await (await POST(req({ action: 'url', id: 'd1' }))).json()).data.url).toBe('https://files/conformite/c1/kbis/1__a.pdf')
    expect((await POST(req({ action: 'delete', id: 'd1' }))).status).toBe(200)
    expect(db.tables.contact_documents).toHaveLength(0)
    expect(db.files.size).toBe(0)
  })

  it('request : mail avec lien de dépôt, lien réutilisé au renvoi', async () => {
    const r1 = await (await POST(req({ action: 'request', contactId: 'c1' }))).json()
    expect(r1.data).toMatchObject({ sent: true, email: 'costa@ex.fr' })
    expect(r1.data.link).toMatch(/^https:\/\/app\.test\/deposer\/[a-f0-9]{48}$/)
    const mail = sendMail.mock.calls[0][1]
    expect(mail).toMatchObject({ to: 'costa@ex.fr', replyTo: 'moe@id.fr' })
    expect(mail.text).toContain(r1.data.link)
    expect(mail.text).toContain('Extrait Kbis de moins de 3 mois')
    const r2 = await (await POST(req({ action: 'request', contactId: 'c1', email: 'admin@costa.fr' }))).json()
    expect(r2.data.link).toBe(r1.data.link)
    expect(db.tables.contact_doc_requests).toHaveLength(1)
    expect(db.tables.contact_doc_requests[0]).toMatchObject({ envois: 2, email: 'admin@costa.fr' })
  })

  it('request sans SMTP : lien créé à copier', async () => {
    smtpConfig.mockReturnValue(null)
    const { data } = await (await POST(req({ action: 'request', contactId: 'c1' }))).json()
    expect(data.sent).toBe(false)
    expect(data.link).toMatch(/\/deposer\//)
    expect(sendMail).not.toHaveBeenCalled()
    expect((await POST(req({ action: 'request', contactId: 'c1', email: 'pas un mail' }))).status).toBe(400)
  })

  it('migration absente : message clair', async () => {
    db = memoryDb({ contacts: [{ ...CONTACT }] }, { errors: { contact_documents: { code: '42P01', message: 'relation does not exist' } } })
    adminClient.mockReturnValue(db.client)
    const res = await POST(req({ action: 'request', contactId: 'c1' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/migration 036/)
  })
})
