/**
 * @jest-environment node
 */
jest.mock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/ai', () => ({ ...jest.requireActual('@/app/lib/ai'), generate: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(), sendMail: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))
jest.mock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))

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
// eslint-disable-next-line import/first
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
// eslint-disable-next-line import/first
import { PDFDocument } from 'pdf-lib'

const okJson = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '' })
// Réponses des sources officielles selon l'URL appelée
const sources = ({ annuaire, bodacc }) => fetchWithRetry.mockImplementation(async (url) => (
  url.includes('recherche-entreprises') ? annuaire : bodacc))

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

  it('register RIB : IBAN reporté sur une fiche vide ; IBAN différent signalé, fiche inchangée jusqu’à vérification', async () => {
    const path = 'conformite/c1/rib/1__rib.pdf'
    db.putFile(path)
    generate.mockResolvedValue(aiJson({ type_document: 'rib', raison_sociale: 'COSTA PLOMBERIE', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP' }))
    const first = (await (await POST(req({ action: 'register', contactId: 'c1', kind: 'rib', path, name: 'rib.pdf' }))).json()).data
    expect(first).toMatchObject({ kind: 'rib', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP', anomalies: [], valide_au: null })
    expect(db.tables.contacts[0].iban).toBe('FR7630006000011234567890189')

    // Nouveau RIB avec un autre IBAN : alerte, la fiche garde l'ancien
    generate.mockResolvedValue(aiJson({ type_document: 'rib', iban: 'FR1420041010050500013M02606' }))
    const second = (await (await POST(req({ action: 'register', contactId: 'c1', kind: 'rib', path, name: 'rib.pdf' }))).json()).data
    expect(second.anomalies[0]).toMatch(/IBAN différent de celui de la fiche.*faux RIB/)
    expect(db.tables.contacts[0].iban).toBe('FR7630006000011234567890189')

    // Vérifié par l'équipe : la fiche prend le nouvel IBAN
    const checked = (await (await POST(req({ action: 'update', id: second.id, verifie: true }))).json()).data
    expect(checked.anomalies).toEqual([])
    expect(db.tables.contacts[0].iban).toBe('FR1420041010050500013M02606')
  })

  it('register RIB sans la migration 037 : message clair', async () => {
    const path = 'conformite/c1/rib/1__rib.pdf'
    db = memoryDb({ contacts: [{ ...CONTACT }] }, { errors: { contact_documents: { code: '23514', message: 'violates check constraint "contact_documents_kind_check"' } } })
    adminClient.mockReturnValue(db.client)
    db.putFile(path)
    generate.mockResolvedValue(aiJson({ type_document: 'rib' }))
    const res = await POST(req({ action: 'register', contactId: 'c1', kind: 'rib', path, name: 'rib.pdf' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/migration 037/)
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

  it('request : le lien suit l’adresse de l’application, pas une variable d’environnement erronée', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://claude-dusky.vercel.app'
    process.env.APP_URL = 'https://claude-dusky.vercel.app'
    const { data } = await (await POST(req({ action: 'request', contactId: 'c1' }))).json()
    expect(data.link).toMatch(/^https:\/\/app\.test\/deposer\//)
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.APP_URL
  })

  it('request sans SMTP : lien créé à copier', async () => {
    smtpConfig.mockReturnValue(null)
    const { data } = await (await POST(req({ action: 'request', contactId: 'c1' }))).json()
    expect(data.sent).toBe(false)
    expect(data.link).toMatch(/\/deposer\//)
    expect(sendMail).not.toHaveBeenCalled()
    expect((await POST(req({ action: 'request', contactId: 'c1', email: 'pas un mail' }))).status).toBe(400)
  })

  it('pause : suspend jusqu’à une date, reprend ; sans la migration 038 : message clair', async () => {
    const r1 = await (await POST(req({ action: 'pause', contactId: 'c1', paused: true, until: '2026-11-01' }))).json()
    expect(r1.data).toMatchObject({ relances_suspendues: true, relances_reprise_le: '2026-11-01' })
    await POST(req({ action: 'pause', contactId: 'c1', paused: false }))
    expect(db.tables.contacts[0]).toMatchObject({ relances_suspendues: false, relances_reprise_le: null })
    expect((await POST(req({ action: 'pause', contactId: 'zz', paused: true }))).status).toBe(404)
    db = memoryDb({ contacts: [{ ...CONTACT }] }, { errors: { contacts: { code: '42703', message: 'column "relances_suspendues" does not exist' } } })
    adminClient.mockReturnValue(db.client)
    const res = await POST(req({ action: 'pause', contactId: 'c1', paused: true }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/migration 038/)
  })

  it('pause_all : suspension générale gardée dans settings', async () => {
    await POST(req({ action: 'pause_all', paused: true }))
    expect(db.tables.settings).toEqual([expect.objectContaining({ key: 'conformite_relances_pause', value: 'on' })])
    await POST(req({ action: 'pause_all', paused: false }))
    expect(db.tables.settings).toEqual([expect.objectContaining({ key: 'conformite_relances_pause', value: 'off' })])
  })

  it('relancer : envoi immédiat à plusieurs entreprises, sans email signalé', async () => {
    db.tables.contacts.push({ id: 'c2', nom: 'Sans Mail', type: 'Artisan' })
    const { data } = await (await POST(req({ action: 'relancer', contactIds: ['c1', 'c2', 'c1'] }))).json()
    expect(data).toEqual({ sent: ['Costa Plomberie'], failed: ['Sans Mail'] })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect((await POST(req({ action: 'relancer', contactIds: [] }))).status).toBe(400)
  })

  it('verifier : entreprise active sans procédure → ok ; liquidation → critique, équipe prévenue une fois', async () => {
    db.tables.authorized_users = [{ email: 'moe@id.fr', role: 'admin', actif: true }]
    sources({
      annuaire: okJson({ results: [{ siren: '552100554', etat_administratif: 'A' }] }),
      bodacc: okJson({ results: [] }),
    })
    const ok = (await (await POST(req({ action: 'verifier', contactId: 'c1' }))).json()).data
    expect(ok).toMatchObject({ contact_id: 'c1', siren: '552100554', statut: 'ok' })
    expect(fetchWithRetry.mock.calls.map(c => c[0]).join(' ')).toMatch(/q=552100554.*where=%22552100554%22|where=%22552100554%22.*q=552100554/)
    expect(db.tables.notifications || []).toHaveLength(0)

    sources({
      annuaire: okJson({ results: [{ siren: '552100554', etat_administratif: 'A' }] }),
      bodacc: okJson({ results: [{ familleavis: 'collective', dateparution: '2026-09-15', registre: ['552100554'], jugement: JSON.stringify({ nature: 'Jugement d\'ouverture de liquidation judiciaire' }) }] }),
    })
    const liq = (await (await POST(req({ action: 'verifier', contactId: 'c1' }))).json()).data
    expect(liq).toMatchObject({ statut: 'critique', libelle: 'Jugement d\'ouverture de liquidation judiciaire (BODACC du 15/09/2026)' })
    expect(db.tables.contact_legal_checks).toHaveLength(1)
    expect(db.tables.notifications).toEqual([expect.objectContaining({ recipient_email: 'moe@id.fr', entity_type: 'contact' })])
    expect(sendMail.mock.calls[0][1].subject).toMatch(/entreprise fermée ou en liquidation/)
    // Même situation au contrôle suivant : pas de nouvelle alerte
    await POST(req({ action: 'verifier', contactId: 'c1' }))
    expect(db.tables.notifications).toHaveLength(1)
  })

  it('verifier : sources injoignables → « non vérifiée », jamais « active »', async () => {
    fetchWithRetry.mockRejectedValue(new Error('réseau'))
    const { data } = await (await POST(req({ action: 'verifier', contactId: 'c1' }))).json()
    expect(data.statut).toBe('inconnu')
  })

  it('dossier : PDF de synthèse + documents en annexe, déposé dans le stockage', async () => {
    const annex = await PDFDocument.create()
    annex.addPage(); annex.addPage()
    db.putFile('conformite/c1/kbis/1__kbis.pdf', await annex.save(), 'application/pdf')
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    db.putFile('conformite/c1/rib/1__rib.png', png, 'image/png')
    db.tables.contact_documents.push(
      { id: 'd1', contact_id: 'c1', kind: 'kbis', file_path: 'conformite/c1/kbis/1__kbis.pdf', file_name: 'kbis.pdf', valide_au: '2099-01-01', anomalies: [], created_at: '2026-09-01T10:00:00Z', depose_par: 'entreprise' },
      { id: 'd2', contact_id: 'c1', kind: 'rib', file_path: 'conformite/c1/rib/1__rib.png', file_name: 'rib.png', iban: 'FR76…', anomalies: ['IBAN différent de celui de la fiche (…1 au lieu de …2) : confirmez par téléphone.'], created_at: '2026-09-02T10:00:00Z', depose_par: 'equipe' },
    )
    db.tables.contact_doc_requests.push({ id: 'r1', contact_id: 'c1', email: 'costa@ex.fr', envois: 2, dernier_envoi: '2026-09-20T08:00:00Z', created_at: '2026-09-13T08:00:00Z', expire_le: '2099-01-01' })
    const { data } = await (await POST(req({ action: 'dossier', contactId: 'c1' }))).json()
    expect(data).toMatchObject({ annexes: 2 })
    expect(data.name).toMatch(/^Dossier de vigilance - Costa Plomberie - \d{4}-\d{2}-\d{2}\.pdf$/)
    const path = [...db.files.keys()].find(k => k.startsWith('conformite/c1/dossier/'))
    expect(data.url).toBe(`https://files/${path}`)
    const built = await PDFDocument.load(new Uint8Array(await db.files.get(path).arrayBuffer()))
    // synthèse (1 page au moins) + 2 pages du Kbis + 1 page pour l'image du RIB
    expect(built.getPageCount()).toBeGreaterThanOrEqual(4)
  })

  it('migration absente : message clair', async () => {
    db = memoryDb({ contacts: [{ ...CONTACT }] }, { errors: { contact_documents: { code: '42P01', message: 'relation does not exist' } } })
    adminClient.mockReturnValue(db.client)
    const res = await POST(req({ action: 'request', contactId: 'c1' }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/migration 036/)
  })
})
