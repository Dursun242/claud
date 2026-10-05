import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DevisRelanceModal from '../DevisRelanceModal'

jest.mock('../../../contexts/ConfirmContext', () => ({ useOptionalConfirm: () => null }))

const state = {
  devis: { id: 'd1', numero: '26-050' },
  initial: { to: 'client@x.fr', subject: 'Votre devis 26-050 : un petit retour ?', intro: 'Bonjour,', outro: 'Cordialement' },
  error: '',
}

describe('DevisRelanceModal', () => {
  it('montre les choix proposés et envoie le formulaire', async () => {
    const onSubmit = jest.fn()
    render(<DevisRelanceModal state={state} onSubmit={onSubmit} onClose={() => {}} />)
    expect(screen.getByText('Le montant dépasse le budget que j’avais prévu')).toBeInTheDocument()
    expect(screen.getByText('Autre (le client précise)')).toBeInTheDocument()
    // La fenêtre place le curseur sur le 1er champ après 50 ms : attendre avant de saisir
    await waitFor(() => expect(screen.getByLabelText('Destinataire')).toHaveFocus())
    await userEvent.type(screen.getByLabelText('Début du message'), ' où en êtes-vous ?')
    await userEvent.click(screen.getByRole('button', { name: '✉ Envoyer la relance' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      to: 'client@x.fr', subject: 'Votre devis 26-050 : un petit retour ?', intro: 'Bonjour, où en êtes-vous ?', outro: 'Cordialement', copyMe: false,
    }))
  })

  it('contrôle du destinataire et erreur du serveur', async () => {
    const onSubmit = jest.fn()
    const { rerender } = render(<DevisRelanceModal state={{ ...state, initial: { ...state.initial, to: 'pas-une-adresse' } }} onSubmit={onSubmit} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '✉ Envoyer la relance' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide : pas-une-adresse')
    expect(onSubmit).not.toHaveBeenCalled()
    rerender(<DevisRelanceModal state={{ ...state, devis: { id: 'd2', numero: '26-051' }, error: 'Serveur mail injoignable' }} onSubmit={onSubmit} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Serveur mail injoignable')
  })
})
