/**
 * @jest-environment node
 */
// Tests de la route /api/entreprises (proxy de l'API Recherche
// d'entreprises de l'État : publique, sans clé).
//   - lookup par SIRET / SIREN → 1 résultat normalisé (404 si aucun)
//   - recherche texte (q) → { resultats, dirigeants, total }
// Auth obligatoire.

jest.mock('@/app/lib/auth', () => ({ verifyAuth: jest.fn() }))
jest.mock('@/app/lib/fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
jest.mock('@/app/lib/logger', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

// eslint-disable-next-line import/first
import { GET } from '../route'
// eslint-disable-next-line import/first
import { verifyAuth } from '@/app/lib/auth'
// eslint-disable-next-line import/first
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'

const req = (url) => ({ url, headers: { get: () => null } })
const fake = ({ ok = true, status = 200, json = null, text = '' } = {}) =>
  ({ ok, status, json: async () => json, text: async () => text })

const result = {
  siren: '921536181', nom_complet: 'ID MAITRISE', activite_principale: '71.12B',
  siege: { siret: '92153618100024', numero_voie: '9', type_voie: 'RUE', libelle_voie: 'HENRY GENESTAL', code_postal: '76600', libelle_commune: 'LE HAVRE' },
  dirigeants: [{ nom: 'CAGLAYAN', prenoms: 'Dursun', qualite: 'Gérant', type_de_personne: 'personne physique' }],
}

beforeEach(() => { verifyAuth.mockReset(); fetchWithRetry.mockReset() })

describe('GET /api/entreprises', () => {
  it('401 sans auth', async () => {
    verifyAuth.mockResolvedValue(null)
    expect((await GET(req('http://x/api/entreprises?q=test'))).status).toBe(401)
  })

  it('400 sans paramètre, SIRET invalide, ou q trop court', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    expect((await GET(req('http://x/api/entreprises'))).status).toBe(400)
    expect((await GET(req('http://x/api/entreprises?siret=12'))).status).toBe(400)
    expect((await GET(req('http://x/api/entreprises?q=ab'))).status).toBe(400)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('SIRET : renvoie l’entreprise normalisée et n’envoie aucune clé', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fake({ json: { results: [result] } }))
    const res = await GET(req('http://x/api/entreprises?siret=921 536 181 00024'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ denomination: 'ID MAITRISE', siret: '92153618100024', num_tva_intracommunautaire: 'FR12921536181' })
    expect(body.siege.ville).toBe('Le Havre')
    const url = fetchWithRetry.mock.calls[0][0]
    expect(url).toContain('recherche-entreprises.api.gouv.fr/search?q=92153618100024')
    expect(url).not.toMatch(/api_token|key=/)
  })

  it('SIRET inconnu → 404 ; API en erreur → 502', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValueOnce(fake({ json: { results: [] } }))
    expect((await GET(req('http://x/api/entreprises?siret=92153618100024'))).status).toBe(404)
    fetchWithRetry.mockResolvedValueOnce(fake({ ok: false, status: 503 }))
    expect((await GET(req('http://x/api/entreprises?siret=92153618100024'))).status).toBe(502)
  })

  it('q : renvoie resultats + dirigeants extraits + total', async () => {
    verifyAuth.mockResolvedValue({ id: 'u1' })
    fetchWithRetry.mockResolvedValue(fake({ json: { results: [result], total_results: 1 } }))
    const res = await GET(req('http://x/api/entreprises?q=caglayan'))
    const body = await res.json()
    expect(body.resultats).toHaveLength(1)
    expect(body.resultats[0].denomination).toBe('ID MAITRISE')
    expect(body.dirigeants[0]).toMatchObject({ nom: 'CAGLAYAN', prenom: 'Dursun' })
    expect(body.total).toBe(1)
    expect(fetchWithRetry.mock.calls[0][0]).toContain('per_page=8')
  })
})
