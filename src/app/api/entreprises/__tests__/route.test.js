/**
 * @jest-environment node
 */
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

const req = (qs) => ({ url: `http://x/api/entreprises?${qs}`, headers: { get: () => 'Bearer t' } })
const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '' })

const RESULT = {
  siren: '552100554', nom_raison_sociale: 'ACME BATIMENT', etat_administratif: 'A',
  siege: { siret: '55210055400013', adresse: '12 RUE DE PARIS 76600 LE HAVRE', code_postal: '76600', libelle_commune: 'LE HAVRE', activite_principale: '43.21A' },
  dirigeants: [{ nom: 'MARTIN', prenoms: 'Julien', qualite: 'Gérant', type_dirigeant: 'personne physique' }],
}

beforeEach(() => {
  verifyAuth.mockReset().mockResolvedValue({ id: 'u1' })
  fetchWithRetry.mockReset()
})

describe('GET /api/entreprises', () => {
  it('401 sans auth, sans appel à l’annuaire', async () => {
    verifyAuth.mockResolvedValue(null)
    expect((await GET(req('siret=55210055400013'))).status).toBe(401)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })

  it('SIRET : interroge l’annuaire (sans clé) et renvoie la fiche', async () => {
    fetchWithRetry.mockResolvedValue(ok({ results: [RESULT] }))
    const res = await GET(req('siret=552%20100%20554%2000013'))
    expect(res.status).toBe(200)
    const url = fetchWithRetry.mock.calls[0][0]
    expect(url).toMatch(/^https:\/\/recherche-entreprises\.api\.gouv\.fr\/search\?/)
    expect(url).toContain('q=55210055400013')
    expect(url).not.toMatch(/token|key/i)
    expect(await res.json()).toMatchObject({
      denomination: 'ACME BATIMENT', siret: '55210055400013', num_tva_intracommunautaire: 'FR96552100554',
      siege: { adresse_ligne_1: '12 RUE DE PARIS', ville: 'LE HAVRE' },
    })
  })

  it('SIRET inconnu → 404 ; SIRET mal formé → 400', async () => {
    fetchWithRetry.mockResolvedValue(ok({ results: [] }))
    expect((await GET(req('siret=55210055400099'))).status).toBe(404)
    expect((await GET(req('siret=123'))).status).toBe(400)
  })

  it('recherche texte : entreprises actives, séparées entreprises / dirigeants', async () => {
    fetchWithRetry.mockResolvedValue(ok({ results: [RESULT] }))
    const res = await GET(req('q=julien%20martin'))
    expect(fetchWithRetry.mock.calls[0][0]).toContain('etat_administratif=A')
    const json = await res.json()
    expect(json.resultats).toHaveLength(0)
    expect(json.dirigeants[0]).toMatchObject({ prenom: 'Julien', nom: 'MARTIN', entreprises: [{ siret: '55210055400013' }] })
  })

  it('annuaire saturé (429) ou en panne → message clair', async () => {
    fetchWithRetry.mockResolvedValue({ ok: false, status: 429, text: async () => '' })
    const busy = await GET(req('q=acme'))
    expect(busy.status).toBe(429)
    expect((await busy.json()).error).toMatch(/réessaie/)
    fetchWithRetry.mockResolvedValue({ ok: false, status: 503, text: async () => '' })
    expect((await GET(req('q=acme'))).status).toBe(502)
  })

  it('paramètres manquants ou trop courts → 400', async () => {
    expect((await GET(req(''))).status).toBe(400)
    expect((await GET(req('q=ab'))).status).toBe(400)
  })
})
