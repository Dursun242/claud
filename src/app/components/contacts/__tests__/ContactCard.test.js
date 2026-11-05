import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactCard from '../ContactCard'

jest.mock('../../../dashboards/shared', () => ({ Icon: () => null, I: {}, SB: { log: jest.fn() } }))

const c = {
  id: 'c1', nom: 'Costa Plomberie', type: 'Artisan', specialite: 'Plomberie', fonction: 'Gérant',
  tel: '06 12 45 78 90', tel_fixe: '02 35 00 00 00', email: 'a@costa.fr', email_travaux: 'chantier@costa.fr',
  adresse: '14 rue Jules Siegfried', code_postal: '76600', ville: 'Le Havre', siret: '81234567800021', note: 4,
}
const handlers = () => ({
  onScore: jest.fn(), onDocs: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(),
  onSaveToPhone: jest.fn(), onCopy: jest.fn(), onDeals: jest.fn(), onNewDeal: jest.fn(),
})

describe('ContactCard', () => {
  it('coordonnées sans emoji, type en texte, actions en bas', async () => {
    const h = handlers()
    render(<ContactCard c={c} {...h} />)
    expect(screen.getByText('Artisan · Plomberie — Gérant')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '06 12 45 78 90' })).toHaveAttribute('href', 'tel:0612457890')
    expect(screen.getByText('fixe')).toBeInTheDocument()
    expect(screen.getByText('travaux')).toBeInTheDocument()
    expect(screen.getByText('4/5')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[📱☎✉🦺📍🏅🎯]/u)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer Costa Plomberie dans les contacts du téléphone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Modifier Costa Plomberie' }))
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer Costa Plomberie' }))
    expect(h.onSaveToPhone).toHaveBeenCalled()
    expect(h.onEdit).toHaveBeenCalled()
    expect(h.onDelete).toHaveBeenCalled()
  })

  it('affaires : pas de « 0 en cours »', () => {
    const { rerender } = render(<ContactCard c={c} deals={{ actives: 0, gagnees: 1 }} {...handlers()} />)
    expect(screen.getByRole('button', { name: '1 affaire gagnée' })).toBeInTheDocument()
    rerender(<ContactCard c={c} deals={{ actives: 2, gagnees: 1 }} {...handlers()} />)
    expect(screen.getByRole('button', { name: '2 affaires en cours · 1 gagnée' })).toBeInTheDocument()
    rerender(<ContactCard c={c} deals={null} {...handlers()} />)
    expect(screen.queryByRole('button', { name: /affaire.*(cours|gagnée)/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Nouvelle affaire' })).toBeInTheDocument()
  })
})
