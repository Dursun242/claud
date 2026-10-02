import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../dashboards/shared', () => ({ btnP: {}, btnS: {} }))
jest.mock('../../index', () => ({
  Modal: ({ open, title, children }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}))

// eslint-disable-next-line import/first
import DuplicatesModal from '../DuplicatesModal'
// eslint-disable-next-line import/first
import { findDuplicateGroups } from '../../../lib/contactDuplicates'

const contacts = [
  { id: '1', nom: 'M. DEBRIS Julien', email: 'debris.julien@hotmail.fr', type: 'Client' },
  { id: '2', nom: 'Julien Debris', tel: '0611223344', adresse: '3 rue X', ville: 'Le Havre', type: 'Client' },
]
const groups = findDuplicateGroups(contacts)
const usage = (c) => (c.id === '1' ? { affaires: 2, chantiers: 0, os: 0 } : { affaires: 0, chantiers: 1, os: 1 })

it('liste les doublons et fusionne avec la valeur choisie', async () => {
  const onMerge = jest.fn().mockResolvedValue(true)
  const user = userEvent.setup()
  render(<DuplicatesModal open groups={groups} usage={usage} onClose={jest.fn()} onIgnore={jest.fn()} onMerge={onMerge} />)
  const g = screen.getByTestId('dup-group')
  expect(within(g).getByText('même nom')).toBeInTheDocument()
  expect(within(g).getByText('2 affaires')).toBeInTheDocument()

  await user.click(within(g).getByRole('button', { name: 'Fusionner…' }))
  // Fiche la plus complète proposée : « Julien Debris »
  const keepGroup = screen.getByRole('radiogroup', { name: 'Fiche à conserver' })
  expect(within(keepGroup).getByRole('radio', { name: /^Julien Debris/ })).toBeChecked()
  expect(screen.getByText(/regroupera : 2 affaire\(s\), 1 chantier\(s\), 1 OS/)).toBeInTheDocument()
  // On garde la fiche la plus complète, mais avec le nom de l'autre
  const nom = screen.getByRole('group', { name: 'Nom' })
  await user.click(within(nom).getByRole('radio', { name: 'M. DEBRIS Julien' }))
  await user.click(screen.getByRole('button', { name: 'Fusionner en « M. DEBRIS Julien »' }))
  await waitFor(() => expect(onMerge).toHaveBeenCalled())
  const arg = onMerge.mock.calls[0][0]
  expect(arg.keep.id).toBe('2')
  expect(arg.drops.map(d => d.id)).toEqual(['1'])
  expect(arg.fields).toMatchObject({ nom: 'M. DEBRIS Julien', email: 'debris.julien@hotmail.fr', tel: '0611223344', ville: 'Le Havre' })
})

it('« Pas un doublon »', async () => {
  const onIgnore = jest.fn()
  render(<DuplicatesModal open groups={groups} usage={usage} onClose={jest.fn()} onIgnore={onIgnore} onMerge={jest.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Pas un doublon' }))
  expect(onIgnore).toHaveBeenCalledWith(groups[0])
})

it('aucun doublon', () => {
  render(<DuplicatesModal open groups={[]} usage={usage} onClose={jest.fn()} onIgnore={jest.fn()} onMerge={jest.fn()} />)
  expect(screen.getByText(/Aucun doublon détecté/)).toBeInTheDocument()
})
