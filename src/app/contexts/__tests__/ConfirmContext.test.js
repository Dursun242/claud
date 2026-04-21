import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmProvider, useConfirm } from '../ConfirmContext'

// Helper : un petit composant qui appelle useConfirm() et expose la
// promesse renvoyée pour qu'on puisse la valider côté test.
function Harness({ opts, onResolved }) {
  const confirm = useConfirm()
  return (
    <button onClick={async () => { onResolved(await confirm(opts)) }}>
      Déclencher
    </button>
  )
}

function renderWithProvider(ui) {
  return render(<ConfirmProvider>{ui}</ConfirmProvider>)
}

describe('ConfirmContext / useConfirm', () => {
  it('jette hors provider', () => {
    // On catch le console.error du render cassé pour garder le test clean
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Harness opts={{}} onResolved={() => {}}/>)).toThrow(/ConfirmProvider/)
    errSpy.mockRestore()
  })

  it("n'affiche rien tant que confirm() n'est pas appelé", () => {
    renderWithProvider(<Harness opts={{}} onResolved={() => {}}/>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('affiche la dialog avec title + message + labels passés en options', async () => {
    renderWithProvider(
      <Harness
        opts={{
          title: 'Supprimer ?',
          message: 'Action irréversible.',
          confirmLabel: 'Oui, supprimer',
          cancelLabel: 'Laisse tomber',
        }}
        onResolved={() => {}}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Supprimer ?')).toBeInTheDocument()
    expect(screen.getByText('Action irréversible.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Oui, supprimer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Laisse tomber' })).toBeInTheDocument()
  })

  it('résout la promesse avec true au clic Confirmer', async () => {
    const onResolved = jest.fn()
    renderWithProvider(<Harness opts={{ title: 'X' }} onResolved={onResolved}/>)

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    await userEvent.click(screen.getByRole('button', { name: /Confirmer/ }))

    expect(onResolved).toHaveBeenCalledWith(true)
    // Et la dialog est fermée
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('résout la promesse avec false au clic Annuler', async () => {
    const onResolved = jest.fn()
    renderWithProvider(<Harness opts={{ title: 'X' }} onResolved={onResolved}/>)

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    await userEvent.click(screen.getByRole('button', { name: /Annuler/ }))

    expect(onResolved).toHaveBeenCalledWith(false)
  })

  it('résout avec false quand on appuie sur Escape', async () => {
    const onResolved = jest.fn()
    renderWithProvider(<Harness opts={{ title: 'X' }} onResolved={onResolved}/>)

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    // Les raccourcis Escape/Enter sont gérés via onKeyDown sur le <div>
    // dialog — ils nécessitent que le focus soit à l'intérieur. Le composant
    // auto-focus le bouton Confirmer après ~30ms (setTimeout). On attend
    // cette bascule de focus, puis on dispatche le keydown depuis le
    // document (userEvent.keyboard) qui bubble jusqu'au dialog.
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmer/ })).toHaveFocus())
    await userEvent.keyboard('{Escape}')

    expect(onResolved).toHaveBeenCalledWith(false)
  })

  it('résout avec true sur Entrée (raccourci clavier)', async () => {
    const onResolved = jest.fn()
    renderWithProvider(<Harness opts={{ title: 'X' }} onResolved={onResolved}/>)

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Confirmer/ })).toHaveFocus())
    await userEvent.keyboard('{Enter}')

    expect(onResolved).toHaveBeenCalledWith(true)
  })

  it('résout avec false au clic sur le backdrop', async () => {
    const onResolved = jest.fn()
    renderWithProvider(<Harness opts={{ title: 'X' }} onResolved={onResolved}/>)

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    await userEvent.click(screen.getByRole('dialog'))

    expect(onResolved).toHaveBeenCalledWith(false)
  })

  it('danger=true applique un style rouge sur le bouton Confirmer', async () => {
    renderWithProvider(
      <Harness opts={{ title: 'X', danger: true, confirmLabel: 'Supprimer' }} onResolved={() => {}}/>
    )

    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))
    const btn = screen.getByRole('button', { name: 'Supprimer' })
    expect(btn).toHaveStyle({ background: '#DC2626' })
  })

  it("utilise les libellés par défaut quand l'appelant n'en fournit pas", async () => {
    renderWithProvider(<Harness opts={{}} onResolved={() => {}}/>)
    await userEvent.click(screen.getByRole('button', { name: /Déclencher/ }))

    // Titre par défaut = "Confirmer ?", bouton = "Confirmer", annuler = "Annuler"
    expect(screen.getByText('Confirmer ?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })
})
