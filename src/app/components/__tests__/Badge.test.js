import { render, screen } from '@testing-library/react'
import Badge from '../Badge'

describe('Badge', () => {
  it('affiche le texte passé en prop', () => {
    render(<Badge text="En cours" color="#10B981"/>)
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('applique la couleur passée (texte + fond)', () => {
    render(<Badge text="Terminé" color="#10B981"/>)
    const badge = screen.getByText('Terminé')
    // Le fond est la couleur + suffixe "18" (opacity) — voir impl.
    expect(badge).toHaveStyle({ color: '#10B981' })
  })

  it('utilise la couleur par défaut quand aucune n\'est fournie', () => {
    render(<Badge text="Défaut"/>)
    const badge = screen.getByText('Défaut')
    // #3B82F6 est le bleu par défaut
    expect(badge).toHaveStyle({ color: '#3B82F6' })
  })
})
