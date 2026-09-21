import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactPicker from '../ContactPicker'

const contacts = [
  { id: 'c1', nom: 'Dupont', societe: 'SCI Dupont', type: 'Client', ville: 'Le Havre' },
  { id: 'c2', nom: 'Lefèvre', type: 'Artisan', specialite: 'Plomberie' },
  { id: 'c3', nom: 'Martin', societe: 'Dupont & Fils', type: 'MOA' },
]

describe('ContactPicker', () => {
  it('filtre sur le nom et la société, sélectionne au clic', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<ContactPicker contacts={contacts} value="" onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), 'dup')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('Dupont')
    expect(options[1]).toHaveTextContent('Martin')
    await user.click(options[1])
    expect(onChange).toHaveBeenCalledWith('c3')
  })

  it('affiche le contact choisi en pastille et permet de le retirer', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<ContactPicker contacts={contacts} value="c1" onChange={onChange} />)
    expect(screen.getByText('Dupont')).toBeInTheDocument()
    expect(screen.getByText('· SCI Dupont')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer le contact' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('propose de créer le contact inconnu et sélectionne le résultat', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const onCreate = jest.fn().mockResolvedValue({ id: 'c9', nom: 'Nouveau' })
    render(<ContactPicker contacts={contacts} value="" onChange={onChange} onCreate={onCreate} />)
    await user.type(screen.getByRole('combobox'), 'Nouveau')
    await user.click(screen.getByRole('option', { name: /Créer le contact « Nouveau »/ }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Nouveau'))
    expect(onChange).toHaveBeenCalledWith('c9')
  })

  it('clavier : flèche bas + Entrée sélectionne', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<ContactPicker contacts={contacts} value="" onChange={onChange} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')
    // Tri : Clients/MOA d'abord (Dupont, Martin), puis Lefèvre → 2e = Martin
    expect(onChange).toHaveBeenCalledWith('c3')
  })
})
