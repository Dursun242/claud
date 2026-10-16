import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EntrepriseScoreModal from '../EntrepriseScoreModal'
import ScoreBadge from '../ScoreBadge'
import { scoreCompanies } from '../../../lib/entrepriseScore'

jest.mock('../../../contexts/ConfirmContext', () => ({ useOptionalConfirm: () => null }))

const TODAY = '2026-10-16'
const contacts = [
  { id: 'a', nom: 'Alpha Maçonnerie', type: 'Artisan', specialite: 'Maçonnerie', note: 5 },
  { id: 'b', nom: 'Bravo Plomberie', type: 'Artisan', specialite: 'Plomberie', note: 2 },
  { id: 'c', nom: 'Charlie Élec', type: 'Sous-traitant', specialite: 'Électricité' },
  { id: 'm', nom: 'Mme Cliente', type: 'Client' },
]
const scores = scoreCompanies({
  contacts,
  tasks: [{ entreprise: 'Bravo Plomberie', statut: 'En cours', echeance: '2026-09-01', nb_rappels: 3, mise_en_demeure_le: '2026-10-01' }],
  ordresService: [{ artisan_nom: 'Alpha Maçonnerie', chantier_id: 'x', montant_ht: 12000, date_emission: '2026-05-04' }],
  today: TODAY,
})

describe('EntrepriseScoreModal', () => {
  it('classement : meilleures en tête, entreprises sans note à la fin, filtre par spécialité', async () => {
    render(<EntrepriseScoreModal open onClose={() => {}} contacts={contacts} scores={scores} />)
    expect(screen.getByText('Classement des entreprises')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').filter(li => li.closest('ol'))
    expect(items.map(li => within(li).getAllByText(/Alpha|Bravo|Charlie/)[0].textContent))
      .toEqual(['Alpha Maçonnerie', 'Bravo Plomberie', 'Charlie Élec'])
    expect(screen.queryByText('Mme Cliente')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Spécialité'), 'Plomberie')
    expect(screen.queryByText('Alpha Maçonnerie')).toBeNull()
    expect(screen.getByText('Bravo Plomberie')).toBeInTheDocument()
  })

  it('détail : critères, historique, boutons', async () => {
    const onEdit = jest.fn()
    const onOpenDocs = jest.fn()
    render(<EntrepriseScoreModal open onClose={() => {}} contacts={contacts} scores={scores} onEdit={onEdit} onOpenDocs={onOpenDocs} />)
    await userEvent.click(screen.getByRole('button', { name: /Alpha Maçonnerie/ }))
    expect(screen.getByText('100/100 — Excellente')).toBeInTheDocument()
    expect(screen.getByText('5/5 étoiles')).toBeInTheDocument()
    expect(screen.getByText(/1 chantier · 1 OS · 12\s000 € HT · dernier OS le 04\/05\/2026/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Donner mon avis/ }))
    expect(onEdit).toHaveBeenCalledWith(contacts[0])
    await userEvent.click(screen.getByRole('button', { name: /Documents/ }))
    expect(onOpenDocs).toHaveBeenCalledWith('a')
    await userEvent.click(screen.getByRole('button', { name: '← Classement' }))
    expect(screen.getByText('Classement des entreprises')).toBeInTheDocument()
  })

  it('ouvert sur une entreprise : détail direct, mise en demeure comptée', () => {
    render(<EntrepriseScoreModal open onClose={() => {}} contacts={contacts} scores={scores} focusId="b" />)
    expect(screen.getByText('Score de l’entreprise')).toBeInTheDocument()
    expect(screen.getByText('0 faite sur 1 · 1 en retard · 3 relances · 1 mise en demeure')).toBeInTheDocument()
  })
})

describe('ScoreBadge', () => {
  it('lettre et note ; rien sans note', async () => {
    const onClick = jest.fn()
    const { container } = render(<ScoreBadge score={scores.get('c')} />)
    expect(container).toBeEmptyDOMElement()
    render(<ScoreBadge score={scores.get('a')} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Score 100\/100/ }))
    expect(onClick).toHaveBeenCalled()
  })
})
