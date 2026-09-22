import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardV from '../DashboardV'
import { localISO } from '../../lib/today'

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
  it('admin : « Ma journée » et actions rapides qui ouvrent le formulaire', async () => {
    const setTab = jest.fn()
    render(<DashboardV data={data} setTab={setTab} m={false} user={null} />)
    expect(screen.getByText(/Ma journée/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Commander carrelage/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Nouvel OS/ }))
    expect(setTab).toHaveBeenCalledWith('os', 'new')
  })

  it('client : suivi des travaux, sans actions de création ni tâches internes', async () => {
    const setTab = jest.fn()
    render(<DashboardV data={data} setTab={setTab} m user={null} clientMode />)
    expect(screen.getByText(/Où en sont les travaux/)).toBeInTheDocument()
    expect(screen.getByText(/en cours de signature/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nouvel OS/ })).toBeNull()
    expect(screen.queryByText(/À faire/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Lire le compte rendu/ }))
    expect(setTab).toHaveBeenCalledWith('reports', 'cr1')
  })
})
