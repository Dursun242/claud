import { render, screen, fireEvent, act } from '@testing-library/react'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const mockEq = jest.fn(() => Promise.resolve({ error: null }))
jest.mock('../../supabaseClient', () => ({
  supabase: { from: () => ({ update: () => ({ eq: (...a) => mockEq(...a) }) }) },
}))

// eslint-disable-next-line import/first
import PlanningV from '../PlanningV'

const chantiers = [{ id: 'ch1', nom: 'Villa Dupont', phase: 'Gros œuvre', date_debut: '2026-09-01', date_fin: '2026-12-01' }]
const os1 = { id: 'os1', numero: 'OS-2026-001', chantier_id: 'ch1', artisan_nom: 'Costa', artisan_specialite: 'Maçonnerie', statut: 'En cours', date_intervention: '2026-10-01', date_fin_prevue: '2026-10-10' }
const os2 = { id: 'os2', numero: 'OS-2026-002', chantier_id: 'ch1', artisan_nom: 'Martin', artisan_specialite: 'Plomberie', statut: 'Émis', date_intervention: '2026-10-05', date_fin_prevue: '2026-10-20' }

beforeEach(() => { addToast.mockClear(); mockEq.mockClear() })

describe('PlanningV', () => {
  it('au téléphone : s’ouvre sur la liste', () => {
    render(<PlanningV data={{ chantiers, ordresService: [os1] }} m />)
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('aucun écouteur tactile global tant qu’on ne glisse pas une barre', () => {
    const spy = jest.spyOn(window, 'addEventListener')
    render(<PlanningV data={{ chantiers, ordresService: [os1] }} m={false} />)
    expect(spy.mock.calls.filter(([t]) => t === 'touchmove')).toHaveLength(0)
    spy.mockRestore()
  })

  it('après un glissement enregistré, le Gantt reprend les données rechargées', async () => {
    const reload = jest.fn()
    const { rerender } = render(<PlanningV data={{ chantiers, ordresService: [os1] }} m={false} reload={reload} />)
    const bar = screen.getByTitle(/Maçonnerie/)
    fireEvent.mouseDown(bar, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 136 })
    await act(async () => { fireEvent.mouseUp(window) })
    expect(mockEq).toHaveBeenCalledWith('id', 'os1')
    expect(reload).toHaveBeenCalled()
    // Données rechargées : un nouvel OS doit apparaître
    rerender(<PlanningV data={{ chantiers, ordresService: [{ ...os1, date_intervention: '2026-10-03', date_fin_prevue: '2026-10-12' }, os2] }} m={false} reload={reload} />)
    expect(screen.getByTitle(/Plomberie/)).toBeInTheDocument()
  })

  it('espace client : consultation seule, pas de glissement', () => {
    render(<PlanningV data={{ chantiers, ordresService: [os1] }} m={false} readOnly />)
    expect(screen.getByText(/consultation/)).toBeInTheDocument()
    expect(screen.queryByText(/Glisser la barre/)).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByTitle(/Maçonnerie/), { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 160 })
    fireEvent.mouseUp(window)
    expect(mockEq).not.toHaveBeenCalled()
  })
})
