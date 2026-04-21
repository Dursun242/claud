import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from '../Modal'

describe('Modal', () => {
  it('ne rend RIEN dans le DOM quand open=false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Caché">
        <p>contenu</p>
      </Modal>
    )
    // open=false → le composant renvoie null
    expect(container.firstChild).toBeNull()
  })

  it('rend le title, les children et le bouton Fermer quand open=true', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Mon titre">
        <p>Corps de modale</p>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Mon titre')).toBeInTheDocument()
    expect(screen.getByText('Corps de modale')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fermer/i })).toBeInTheDocument()
  })

  it('a les attributs ARIA de dialog (role, aria-modal, aria-labelledby)', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Titre a11y">
        <p/>
      </Modal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Le labelledby pointe sur l'id de h3 (généré aléatoirement)
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    expect(document.getElementById(labelId)).toHaveTextContent('Titre a11y')
  })

  it('invoque onClose au clic sur le bouton Fermer', async () => {
    const onClose = jest.fn()
    render(<Modal open={true} onClose={onClose} title="X"><p/></Modal>)

    await userEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('invoque onClose au clic sur le backdrop', async () => {
    const onClose = jest.fn()
    render(<Modal open={true} onClose={onClose} title="X"><p/></Modal>)

    // Le dialog lui-même est le backdrop (click propagé).
    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('NE ferme PAS quand on clique à l\'intérieur du contenu', async () => {
    const onClose = jest.fn()
    render(
      <Modal open={true} onClose={onClose} title="X">
        <p data-testid="contenu">clique moi</p>
      </Modal>
    )

    await userEvent.click(screen.getByTestId('contenu'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ferme sur Escape', async () => {
    const onClose = jest.fn()
    render(<Modal open={true} onClose={onClose} title="X"><p/></Modal>)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bloque le scroll du body quand ouverte, le rétablit à la fermeture', () => {
    const { rerender, unmount } = render(
      <Modal open={true} onClose={() => {}} title="X"><p/></Modal>
    )
    expect(document.body.style.overflow).toBe('hidden')

    // Fermeture par rerender avec open=false
    rerender(<Modal open={false} onClose={() => {}} title="X"><p/></Modal>)
    expect(document.body.style.overflow).not.toBe('hidden')

    unmount()
  })
})
