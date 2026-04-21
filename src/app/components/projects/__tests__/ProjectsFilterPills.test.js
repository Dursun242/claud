import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsFilterPills from '../ProjectsFilterPills'
import { PROJECT_STATUSES, PROJECT_PHASES } from '../projectsConstants'

describe('ProjectsFilterPills', () => {
  it('affiche les deux rangées (Statut + Phase) avec "Tous/Toutes"', () => {
    render(<ProjectsFilterPills filterStatut="" filterPhase="" onStatut={() => {}} onPhase={() => {}}/>)

    expect(screen.getByText('Statut')).toBeInTheDocument()
    expect(screen.getByText('Phase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tous/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Toutes/ })).toBeInTheDocument()
  })

  it('affiche une pill par statut et par phase documentés', () => {
    render(<ProjectsFilterPills filterStatut="" filterPhase="" onStatut={() => {}} onPhase={() => {}}/>)

    for (const s of PROJECT_STATUSES) {
      expect(screen.getByRole('button', { name: s })).toBeInTheDocument()
    }
    for (const p of PROJECT_PHASES) {
      expect(screen.getByRole('button', { name: p })).toBeInTheDocument()
    }
  })

  it("onStatut est invoqué avec le libellé du statut cliqué (activation)", async () => {
    const onStatut = jest.fn()
    render(<ProjectsFilterPills filterStatut="" filterPhase="" onStatut={onStatut} onPhase={() => {}}/>)

    await userEvent.click(screen.getByRole('button', { name: 'En cours' }))
    expect(onStatut).toHaveBeenCalledWith('En cours')
  })

  it('onStatut est invoqué avec "" quand on re-clique sur le statut actif (désactivation)', async () => {
    const onStatut = jest.fn()
    render(<ProjectsFilterPills filterStatut="En cours" filterPhase="" onStatut={onStatut} onPhase={() => {}}/>)

    await userEvent.click(screen.getByRole('button', { name: 'En cours' }))
    expect(onStatut).toHaveBeenCalledWith('')
  })

  it('onPhase est invoqué avec la phase cliquée', async () => {
    const onPhase = jest.fn()
    render(<ProjectsFilterPills filterStatut="" filterPhase="" onStatut={() => {}} onPhase={onPhase}/>)

    await userEvent.click(screen.getByRole('button', { name: 'Finitions' }))
    expect(onPhase).toHaveBeenCalledWith('Finitions')
  })

  it('clic sur "Tous" rappelle onStatut("")', async () => {
    const onStatut = jest.fn()
    render(<ProjectsFilterPills filterStatut="En cours" filterPhase="" onStatut={onStatut} onPhase={() => {}}/>)

    await userEvent.click(screen.getByRole('button', { name: /Tous/ }))
    expect(onStatut).toHaveBeenCalledWith('')
  })
})
