import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OsStatusPills from '../OsStatusPills'
import { OS_STATUSES } from '../osConstants'

const fullCounts = {
  all: 10, Brouillon: 2, 'Émis': 4, 'Signé': 1,
  'En cours': 2, 'Terminé': 1, 'Annulé': 0,
}

describe('OsStatusPills', () => {
  it('affiche une pill "Tous" + une pill pour chaque statut documenté', () => {
    render(<OsStatusPills statusFilter="all" onChange={() => {}} countByStatus={fullCounts}/>)

    expect(screen.getByRole('button', { name: /Tous/ })).toBeInTheDocument()
    for (const s of OS_STATUSES) {
      // Le bouton contient le label + le compteur → match partiel.
      expect(screen.getByRole('button', { name: new RegExp(s) })).toBeInTheDocument()
    }
  })

  it('affiche le compteur de chaque statut', () => {
    render(<OsStatusPills statusFilter="all" onChange={() => {}} countByStatus={fullCounts}/>)

    // "Émis" + compteur 4 : le bouton contient les deux.
    const emisBtn = screen.getByRole('button', { name: /Émis/ })
    expect(emisBtn).toHaveTextContent('4')

    const tousBtn = screen.getByRole('button', { name: /Tous/ })
    expect(tousBtn).toHaveTextContent('10')
  })

  it("invoque onChange avec la clé du statut cliqué", async () => {
    const onChange = jest.fn()
    render(<OsStatusPills statusFilter="all" onChange={onChange} countByStatus={fullCounts}/>)

    await userEvent.click(screen.getByRole('button', { name: /Émis/ }))
    expect(onChange).toHaveBeenCalledWith('Émis')

    await userEvent.click(screen.getByRole('button', { name: /Tous/ }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('affiche 0 pour un statut absent du countByStatus', () => {
    render(<OsStatusPills statusFilter="all" onChange={() => {}} countByStatus={{ all: 5 }}/>)

    // "Brouillon" pas dans countByStatus → fallback 0
    expect(screen.getByRole('button', { name: /Brouillon/ })).toHaveTextContent('0')
  })
})
