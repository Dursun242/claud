import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OfflineBanner from '../OfflineBanner'

describe('OfflineBanner', () => {
  it('invisible quand tout est en ligne et envoyé', () => {
    const { container } = render(<OfflineBanner online pending={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hors ligne : prévient que les données sont locales et combien de modifications attendent', () => {
    render(<OfflineBanner online={false} pending={2} restoredAt={Date.now()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/Hors ligne/)
    expect(screen.getByRole('status')).toHaveTextContent(/2 modifications seront envoyées au retour du réseau/)
  })

  it('de retour en ligne avec des envois en attente : bouton « Envoyer maintenant »', async () => {
    const onRetry = jest.fn()
    render(<OfflineBanner online pending={1} onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 modification en attente d’envoi.')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer maintenant' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
