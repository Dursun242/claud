import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardV from '../DashboardV'
import { localISO } from '../../lib/today'

// Documents des entreprises : données fournies par le test (pas de React Query)
const mockConformite = { docs: [], missingMigration: false }
jest.mock('../../hooks/useConformite', () => ({ useConformite: () => mockConformite }))

const today = localISO()
const data = {
  chantiers: [{ id: 'ch1', nom: 'Maison Dupont', client: 'Dupont', statut: 'En cours', budget: 1000, depenses: 200 }],
  tasks: [{ id: 't1', titre: 'Commander carrelage', statut: 'Planifié', echeance: today, chantierId: 'ch1' }],
  ordresService: [{ id: 'os1', numero: 'OS-1', artisan_nom: 'Costa', statut: 'Émis', statut_signature: 'Envoyé' }],
  compteRendus: [{ id: 'cr1', numero: 2, date: today, resume: 'Point hebdo', chantierId: 'ch1' }],
  planning: [{ id: 'p1', lot: 'Peinture', debut: today, fin: today, avancement: 40, chantierId: 'ch1' }],
  rdv: [],
}

describe('DashboardV', () => {
  // « Le mot du jour » (IA) : pas d'appel réseau dans ces tests
  beforeEach(() => { global.fetch = jest.fn(() => Promise.reject(new Error('hors ligne'))) })
  afterEach(() => { delete global.fetch })

  it('admin : « Ma journée » et actions rapides qui ouvrent le formulaire', async () => {
    const setTab = jest.fn()
    render(<DashboardV data={data} setTab={setTab} m={false} user={null} />)
    expect(screen.getByText(/Ma journée/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Mes priorités du jour/ })).toBeInTheDocument()
    // « Mes priorités du jour » + « Ma journée » + liste des tâches actives
    expect(screen.getAllByRole('button', { name: /Commander carrelage/ })).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: /Nouvel OS/ }))
    expect(setTab).toHaveBeenCalledWith('os', 'new')
  })

  it('cartes chantier et lignes de tâche utilisables au clavier (Entrée / Espace)', async () => {
    const setTab = jest.fn()
    render(<DashboardV data={data} setTab={setTab} m={false} user={null} />)
    const card = screen.getByRole('button', { name: 'Ouvrir le chantier Maison Dupont' })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(setTab).toHaveBeenCalledWith('projects', 'ch1')
    const row = screen.getAllByRole('button', { name: /Commander carrelage/ }).find((el) => el.tagName === 'DIV')
    row.focus()
    await userEvent.keyboard(' ')
    expect(setTab).toHaveBeenCalledWith('tasks', 't1')
  })

  it('client : suivi des travaux, sans actions de création ni tâches internes', async () => {
    const setTab = jest.fn()
    render(<DashboardV data={data} setTab={setTab} m user={null} clientMode />)
    expect(screen.getByText(/Où en sont les travaux/)).toBeInTheDocument()
    expect(screen.getByText(/en cours de signature/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nouvel OS/ })).toBeNull()
    expect(screen.queryByText(/Mes priorités du jour/)).toBeNull()
    expect(screen.queryByText(/À faire/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Lire le compte rendu/ }))
    expect(setTab).toHaveBeenCalledWith('reports', 'cr1')
  })

  it('priorités : une entreprise sur un chantier en cours dont l’URSSAF a expiré', async () => {
    const setTab = jest.fn()
    const withCompany = {
      ...data,
      contacts: [{ id: 'c1', nom: 'Costa', type: 'Artisan', specialite: 'Plomberie' }],
      ordresService: [{ ...data.ordresService[0], chantier_id: 'ch1' }],
    }
    mockConformite.docs = [{ id: 'd1', contact_id: 'c1', kind: 'urssaf', valide_au: '2020-01-01', anomalies: [], created_at: '2020-01-01' }]
    render(<DashboardV data={withCompany} setTab={setTab} m={false} user={null} />)
    const item = screen.getByRole('button', { name: /Documents — Costa/ })
    expect(item).toHaveTextContent(/URSSAF expirée depuis/)
    await userEvent.click(item)
    expect(setTab).toHaveBeenCalledWith('contacts', 'docs:c1')
    mockConformite.docs = []
  })
})
