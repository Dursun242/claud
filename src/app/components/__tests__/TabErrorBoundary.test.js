import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TabErrorBoundary from '../TabErrorBoundary'

let casse = true
function Page() {
  if (casse) throw new Error('boom')
  return <div>Contenu de l’onglet</div>
}

beforeEach(() => {
  casse = true
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => console.error.mockRestore())

describe('TabErrorBoundary', () => {
  it('isole l’erreur : message dans l’onglet, le reste de l’app reste affiché', () => {
    render(<div><nav>Menu</nav><TabErrorBoundary name="crm"><Page /></TabErrorBoundary></div>)
    expect(screen.getByRole('alert')).toHaveTextContent('Cet onglet a rencontré un problème')
    expect(screen.getByText('Menu')).toBeInTheDocument()
  })

  it('« Réessayer » relance le rendu de l’onglet', async () => {
    const user = userEvent.setup()
    render(<TabErrorBoundary name="crm"><Page /></TabErrorBoundary>)
    casse = false
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(screen.getByText('Contenu de l’onglet')).toBeInTheDocument()
  })

  it('retente automatiquement quand resetKey change (nouvelles données)', () => {
    const { rerender } = render(<TabErrorBoundary name="crm" resetKey={1}><Page /></TabErrorBoundary>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    casse = false
    rerender(<TabErrorBoundary name="crm" resetKey={2}><Page /></TabErrorBoundary>)
    expect(screen.getByText('Contenu de l’onglet')).toBeInTheDocument()
  })
})
