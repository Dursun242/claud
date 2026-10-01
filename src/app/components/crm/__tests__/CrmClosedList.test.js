import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../dashboards/shared', () => ({
  fmtMoney: (n) => `${Number(n) || 0} €`,
  fmtDate: (d) => String(d).split('-').reverse().join('/'),
}))
jest.mock('../../index', () => ({
  EmptyState: ({ title }) => <div role="status">{title}</div>,
}))

// eslint-disable-next-line import/first
import CrmClosedList from '../CrmClosedList'

const year = new Date().getFullYear()
const contactsById = new Map([['c1', { nom: 'Dupont' }]])

it('gagnées : total, plus récentes d’abord, chantier, ouverture', async () => {
  const onOpen = jest.fn()
  render(<CrmClosedList kind="won" contactsById={contactsById} onOpen={onOpen}
    chantiers={[{ id: 'ch1', nom: 'Garage Dupont' }]}
    list={[
      { id: 'a', titre: 'Ancienne', etape: 'Gagné', montant_estime: 1000, date_cloture: '2024-03-01' },
      { id: 'b', titre: 'Garage', etape: 'Gagné', montant_estime: 9000, date_cloture: `${year}-09-20`, contact_id: 'c1', chantier_id: 'ch1' },
    ]} />)
  expect(screen.getByText('2 affaires · 10000 €')).toBeInTheDocument()
  expect(screen.getByText(`dont ${year} : 1 · 9000 €`)).toBeInTheDocument()
  const rows = screen.getAllByRole('button')
  expect(rows[0]).toHaveTextContent('Garage')
  expect(rows[0]).toHaveTextContent('chantier Garage Dupont')
  await userEvent.click(rows[0])
  expect(onOpen).toHaveBeenCalledWith('b')
})

it('perdues : motifs les plus fréquents ; vide', () => {
  const { unmount } = render(<CrmClosedList kind="lost" contactsById={contactsById} chantiers={[]} onOpen={() => {}}
    list={[
      { id: 'a', titre: 'A', etape: 'Perdu', montant_estime: 100, motif_perte: 'Prix' },
      { id: 'b', titre: 'B', etape: 'Perdu', montant_estime: 200, motif_perte: 'Prix' },
      { id: 'c', titre: 'C', etape: 'Perdu', montant_estime: 300 },
    ]} />)
  expect(screen.getByText('Motifs : Prix (2) · Sans motif (1)')).toBeInTheDocument()
  unmount()
  render(<CrmClosedList kind="lost" list={[]} contactsById={contactsById} chantiers={[]} onOpen={() => {}} />)
  expect(screen.getByRole('status')).toHaveTextContent('Aucune affaire perdue')
})
