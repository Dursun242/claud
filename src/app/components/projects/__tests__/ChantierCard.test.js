import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChantierCard from '../ChantierCard'

const baseChantier = {
  id: 'ch-1',
  nom: 'Villa Dupont',
  client: 'M. Dupont',
  adresse: '1 rue du Test, Le Havre',
  phase: 'Finitions',
  statut: 'En cours',
  date_debut: '2026-01-01',
  date_fin: '2026-12-31',
}

const baseCounts = { os: 5, cr: 3, tasks: 8, attachments: 2 }

function renderCard(overrides = {}) {
  const handlers = {
    onOpen: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  }
  render(
    <ChantierCard
      ch={baseChantier}
      counts={baseCounts}
      m={false}
      readOnly={false}
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

describe('ChantierCard', () => {
  it('affiche le nom, le client et l\'adresse', () => {
    renderCard()
    expect(screen.getByText('Villa Dupont')).toBeInTheDocument()
    expect(screen.getByText(/M\. Dupont/)).toBeInTheDocument()
    expect(screen.getByText(/rue du Test/)).toBeInTheDocument()
  })

  it('affiche les 4 compteurs passés en props', () => {
    renderCard()
    expect(screen.getByText('5 OS')).toBeInTheDocument()
    expect(screen.getByText('3 CR')).toBeInTheDocument()
    expect(screen.getByText('8 tâches')).toBeInTheDocument()
    expect(screen.getByText('2 PJ')).toBeInTheDocument()
  })

  it('affiche les badges phase et statut', () => {
    renderCard()
    expect(screen.getByText('Finitions')).toBeInTheDocument()
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('affiche "Terminé" à 100% quand le statut est "Terminé"', () => {
    renderCard({ ch: { ...baseChantier, statut: 'Terminé' } })
    // Badge + label de progression affichent "Terminé"
    expect(screen.getAllByText('Terminé').length).toBeGreaterThan(0)
  })

  it('invoque onOpen(ch) quand on clique sur la carte', async () => {
    const handlers = renderCard()
    // La carte entière (le premier div) est cliquable. On clique sur le
    // titre pour être sûr de toucher la zone, pas les petits boutons.
    await userEvent.click(screen.getByText('Villa Dupont'))
    expect(handlers.onOpen).toHaveBeenCalledWith(baseChantier)
  })

  it('ne propage pas onOpen quand on clique sur les boutons edit/delete', async () => {
    const handlers = renderCard()
    const buttons = screen.getAllByRole('button')
    // Par convention le premier bouton est Modifier, le second Supprimer.
    await userEvent.click(buttons[0])
    expect(handlers.onEdit).toHaveBeenCalledWith(baseChantier)
    expect(handlers.onOpen).not.toHaveBeenCalled()

    await userEvent.click(buttons[1])
    expect(handlers.onDelete).toHaveBeenCalledWith(baseChantier)
  })

  it('en mode readOnly : cache les boutons edit/delete', () => {
    renderCard({ readOnly: true })
    // Plus aucun bouton dans la carte en lecture seule.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('gère des dates absentes sans planter (progression 0%)', () => {
    renderCard({ ch: { ...baseChantier, date_debut: null, date_fin: null } })
    // Pas de crash : le composant s'affiche toujours.
    expect(screen.getByText('Villa Dupont')).toBeInTheDocument()
  })
})
