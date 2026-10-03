/**
 * @jest-environment node
 */
jest.mock('@/app/lib/supabaseClients', () => ({ adminClient: jest.fn() }))
jest.mock('@/app/lib/ai', () => ({ ...jest.requireActual('@/app/lib/ai'), generate: jest.fn() }))
jest.mock('@/app/lib/mailer', () => ({ smtpConfig: jest.fn(() => null), sendMail: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({ createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) }))

// eslint-disable-next-line import/first
import { GET, POST } from '../route'
// eslint-disable-next-line import/first
import { adminClient } from '@/app/lib/supabaseClients'
// eslint-disable-next-line import/first
import { generate } from '@/app/lib/ai'
// eslint-disable-next-line import/first
import { memoryDb } from '@/test-utils/memoryDb'

const TOKEN = 'a'.repeat(48)
const headers = { get: (k) => (k === 'x-forwarded-for' ? '1.2.3.4' : null) }
const get = (token) => GET({ url: `https://app.test/api/conformite/public?token=${token}`, headers })
const post = (body) => POST({ url: 'https://app.test/api/conformite/public', headers, json: async () => body })
const future = new Date(Date.now() + 10 * 86_400_000).toISOString()

let db
beforeEach(() => {
  db = memoryDb({
    contacts: [{ id: 'c1', nom: 'Jean Costa', societe: 'Costa Plomberie', type: 'Artisan', siret: '55210055400013' }],
    contact_documents: [{ id: 'd0', contact_id: 'c1', kind: 'kbis', file_path: 'conformite/c1/kbis/0__k.pdf', valide_au: '2099-01-01', anomalies: [], created_at: '2026-09-01' }],
    contact_doc_requests: [
      { id: 'r1', contact_id: 'c1', token: TOKEN, expire_le: future, envois: 1 },
      { id: 'r2', contact_id: 'c1', token: 'b'.repeat(48), expire_le: '2020-01-01T00:00:00Z', envois: 1 },
    ],
    authorized_users: [{ email: 'moe@id.fr', role: 'admin', actif: true }, { email: 'client@x.fr', role: 'client', actif: true }],
    notifications: [],
  })
  adminClient.mockReturnValue(db.client)
})

describe('/api/conformite/public (sans compte, par jeton)', () => {
  it('lien invalide ou expiré', async () => {
    expect((await get('pas-un-jeton')).status).toBe(404)
    expect((await get('c'.repeat(48))).status).toBe(404)
    const exp = await get('b'.repeat(48))
    expect(exp.status).toBe(410)
    expect((await exp.json()).error).toMatch(/expiré/)
  })

  it('GET : entreprise et état des documents, sans fichier ni donnée lue', async () => {
    const res = await get(TOKEN)
    const { data } = await res.json()
    expect(data.entreprise).toBe('Costa Plomberie')
    expect(data.documents.map(d => [d.kind, d.status])).toEqual([['kbis', 'ok'], ['decennale', 'manquant'], ['urssaf', 'manquant'], ['fiscale', 'manquant'], ['rib', 'manquant']])
    expect(JSON.stringify(data)).not.toMatch(/conformite\/|file_path|siret|"iban"|"bic"/)
    expect(db.tables.contact_doc_requests[0].derniere_visite).toBeTruthy()
  })

  it('GET : document erroné « à renvoyer » avec son motif ; IBAN à vérifier par l’équipe non montré', async () => {
    db.tables.contact_documents.push(
      { id: 'd1', contact_id: 'c1', kind: 'fiscale', file_path: 'p', valide_au: '2099-01-01', anomalies: ['Attestation négative : dettes fiscales.'], created_at: '2026-09-02' },
      { id: 'd2', contact_id: 'c1', kind: 'rib', file_path: 'p', iban: 'FR14…', anomalies: ['IBAN différent de celui de la fiche (…2606 au lieu de …0189) : confirmez par téléphone.'], created_at: '2026-09-02' },
    )
    const { data } = await (await get(TOKEN)).json()
    expect(data.documents.find(d => d.kind === 'fiscale')).toMatchObject({ status: 'a_renvoyer', motif: 'Attestation négative : dettes fiscales.' })
    const rib = data.documents.find(d => d.kind === 'rib')
    expect(rib.status).toBe('a_verifier')
    expect(rib.motif).toBeUndefined()
    expect(JSON.stringify(data)).not.toMatch(/IBAN différent|2606/)
  })

  it('POST : dépôt de l’entreprise, l’équipe est prévenue', async () => {
    const prep = await (await post({ token: TOKEN, action: 'prepare', kind: 'urssaf', name: 'vigilance.pdf', type: 'application/pdf', size: 1000 })).json()
    expect(prep.data.path).toMatch(/^conformite\/c1\/urssaf\//)
    db.putFile(prep.data.path)
    generate.mockResolvedValue({ ok: true, text: JSON.stringify({
      type_document: 'urssaf', raison_sociale: 'COSTA', siret: '55210055400013', date_document: '2026-09-20', valide_du: '', valide_au: '',
      assureur: '', numero_police: '', activites: '', activite_couverte: 'inconnu', code_securite: 'ABC123', anomalies: [],
    }) })
    const res = await post({ token: TOKEN, action: 'register', kind: 'urssaf', path: prep.data.path, name: 'vigilance.pdf' })
    const { data } = await res.json()
    expect(data.documents.find(d => d.kind === 'urssaf')).toMatchObject({ status: 'ok', valideAu: '2027-03-20' })
    expect(db.tables.contact_documents.find(d => d.kind === 'urssaf')).toMatchObject({ depose_par: 'entreprise', code_securite: 'ABC123' })
    expect(db.tables.notifications).toEqual([expect.objectContaining({ recipient_email: 'moe@id.fr', entity_type: 'contact', target_tab: 'contacts' })])
  })

  it('POST : jeton requis, pas d’accès à une autre entreprise', async () => {
    expect((await post({ action: 'prepare', kind: 'kbis', name: 'a.pdf', size: 1 })).status).toBe(404)
    expect((await post({ token: TOKEN, action: 'register', kind: 'kbis', path: 'conformite/c2/kbis/1__a.pdf' })).status).toBe(400)
    expect((await post({ token: TOKEN, action: 'delete', id: 'd0' })).status).toBe(400)
    expect(db.tables.contact_documents).toHaveLength(1)
  })
})
