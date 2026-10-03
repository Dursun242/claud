import { render, screen } from '@testing-library/react'

// Réponses Supabase par table : { data, error }. Le constructeur de requête
// est chaînable et « thenable » comme celui de supabase-js.
const results = {}
const builder = (table) => {
  const q = {
    select: () => q, order: () => q, limit: () => q, or: () => q,
    then: (ok, ko) => Promise.resolve(results[table] || { data: [], error: null }).then(ok, ko),
  }
  return q
}
jest.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table) => builder(table),
    rpc: (name) => Promise.resolve(results[`rpc:${name}`] || { data: [], error: null }),
  },
}))
// components/index.js ré-importe shared.js (cycle) : on ne garde que l'utile.
jest.mock('../../components', () => ({ ProgressBar: () => null }))

// eslint-disable-next-line import/first
import { SB, FF } from '../shared'

beforeEach(() => { for (const k of Object.keys(results)) delete results[k] })

describe('SB.loadCritical', () => {
  it('charge les 4 tables quand tout répond', async () => {
    results.chantiers = { data: [{ id: 'c1' }], error: null }
    results.taches = { data: [{ id: 't1', chantier_id: 'c1' }], error: null }
    const r = await SB.loadCritical()
    expect(r.error).toBeUndefined()
    expect(r.chantiers).toHaveLength(1)
    expect(r.tasks).toEqual([expect.objectContaining({ id: 't1', chantierId: 'c1' })])
  })

  it.each(['chantiers', 'taches', 'compte_rendus', 'ordres_service'])(
    'renvoie une erreur si %s échoue (au lieu d’une liste vide)', async (table) => {
      results[table] = { data: null, error: { message: 'timeout' } }
      const r = await SB.loadCritical()
      expect(r.error).toBe(`Chargement ${table} impossible : timeout`)
    })
})

describe('SB.loadSecondary', () => {
  it.each(['contacts', 'planning', 'rdv', 'contact_chantiers'])(
    'lève si %s échoue (au lieu d’une liste vide)', async (table) => {
      results[table] = { data: null, error: { message: 'timeout' } }
      await expect(SB.loadSecondary()).rejects.toThrow(`Chargement ${table} impossible : timeout`)
    })

  it('RPC des compteurs absente (migration 020) : repli silencieux', async () => {
    results.contacts = { data: [{ id: 'ct1' }], error: null }
    results['rpc:chantier_attachment_counts'] = { data: null, error: { message: 'function does not exist' } }
    const r = await SB.loadSecondary()
    expect(r.contacts).toHaveLength(1)
    expect(r.attachmentCountsByChantier.size).toBe(0)
  })
})

describe('FF', () => {
  it('relie le label au champ natif unique', () => {
    render(<FF label="Nom"><input /></FF>)
    expect(screen.getByLabelText('Nom').tagName).toBe('INPUT')
  })

  it('garde l’id déjà défini sur le champ', () => {
    render(<FF label="Ville"><select id="ville"><option>Le Havre</option></select></FF>)
    expect(screen.getByLabelText('Ville')).toHaveAttribute('id', 'ville')
  })

  it('ne touche pas aux enfants multiples ou non natifs', () => {
    const Picker = (props) => <span data-testid="picker" {...props} />
    const { container } = render(<FF label="Adresse"><Picker /></FF>)
    expect(container.querySelector('label')).not.toHaveAttribute('for')
    expect(screen.getByTestId('picker')).not.toHaveAttribute('id')
  })
})
