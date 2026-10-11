import { render, screen } from '@testing-library/react'
import Badge from '../Badge'

describe('Badge', () => {
  it('affiche le texte passé en prop', () => {
    render(<Badge text="En cours" color="#10B981"/>)
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('texte en teinte foncée lisible de la couleur, sur fond dilué', () => {
    render(<Badge text="Terminé" color="#10B981"/>)
    const badge = screen.getByText('Terminé')
    expect(badge).toHaveStyle({ color: '#047857' })
    expect(badge.style.background).not.toBe('')
  })

  it('utilise le bleu par défaut quand aucune couleur n\'est fournie', () => {
    render(<Badge text="Défaut"/>)
    expect(screen.getByText('Défaut')).toHaveStyle({ color: '#1D4ED8' })
  })

  it('garde une couleur inconnue telle quelle', () => {
    render(<Badge text="Autre" color="#123456"/>)
    expect(screen.getByText('Autre')).toHaveStyle({ color: '#123456' })
  })
})
