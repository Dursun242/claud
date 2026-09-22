import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileNav, { QuickCreateSheet } from '../MobileNav'
import TodayPanel from '../dashboard/TodayPanel'
import { buildAgenda } from '../../lib/today'

const items = [
  { key: 'dashboard', label: 'Accueil', icon: 'M0 0' },
  { key: 'projects', label: 'Chantiers', icon: 'M0 0' },
  { key: 'tasks', label: 'Tâches', icon: 'M0 0' },
]

describe('MobileNav', () => {
  it('navigue, ouvre le menu et le bouton Créer', async () => {
    const onSelect = jest.fn(), onMenu = jest.fn(), onCreate = jest.fn()
    render(<MobileNav items={items} active="projects" onSelect={onSelect} onMenu={onMenu} onCreate={onCreate} />)
    expect(screen.getByRole('button', { name: /Chantiers/ })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(screen.getByRole('button', { name: /Tâches/ }))
    expect(onSelect).toHaveBeenCalledWith('tasks')
    await userEvent.click(screen.getByRole('button', { name: /Créer/ }))
    expect(onCreate).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Plus d'onglets/ }))
    expect(onMenu).toHaveBeenCalled()
  })

  it('sans onCreate, pas de bouton central', () => {
    render(<MobileNav items={items} active="dashboard" onSelect={() => {}} onMenu={() => {}} />)
    expect(screen.queryByRole('button', { name: /Créer/ })).toBeNull()
  })
})

describe('QuickCreateSheet', () => {
  it('lance l’action choisie puis se ferme', async () => {
    const onPick = jest.fn(), onClose = jest.fn()
    render(<QuickCreateSheet open onClose={onClose} actions={[{ key: 'os', emoji: '📋', label: 'Ordre de service', onPick }]} />)
    await userEvent.click(screen.getByRole('button', { name: /Ordre de service/ }))
    expect(onClose).toHaveBeenCalled()
    expect(onPick).toHaveBeenCalled()
  })

  it('Escape ferme la feuille ; fermée = rien rendu', async () => {
    const onClose = jest.fn()
    const { rerender } = render(<QuickCreateSheet open onClose={onClose} actions={[]} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    rerender(<QuickCreateSheet open={false} onClose={onClose} actions={[]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('TodayPanel', () => {
  const TODAY = '2026-09-22'
  it('affiche les retards et ouvre l’élément au clic', async () => {
    const agenda = buildAgenda({
      chantiers: [{ id: 'ch1', nom: 'Maison Dupont' }],
      tasks: [{ id: 't1', titre: 'Relancer plombier', statut: 'En cours', echeance: '2026-09-20', chantierId: 'ch1' }],
    }, { today: TODAY })
    const onOpen = jest.fn()
    render(<TodayPanel agenda={agenda} onOpen={onOpen} />)
    expect(screen.getByText(/En retard · 1/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Relancer plombier/ }))
    expect(onOpen).toHaveBeenCalledWith('tasks', 't1')
  })

  it('message rassurant quand rien à faire', () => {
    render(<TodayPanel agenda={buildAgenda({}, { today: TODAY })} onOpen={() => {}} />)
    expect(screen.getByText(/Rien d.urgent/)).toBeInTheDocument()
  })

  it('replie au-delà de 6 éléments', async () => {
    const tasks = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, titre: `Tâche ${i}`, statut: 'Planifié', echeance: TODAY }))
    render(<TodayPanel agenda={buildAgenda({ tasks }, { today: TODAY })} onOpen={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: /Tout afficher \(9\)/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
  })
})
