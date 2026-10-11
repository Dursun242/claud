import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardLoadState, { PAUSED_NOTICE_MS, SLOW_NOTICE_MS } from '../DashboardLoadState'

jest.mock('../Skeleton', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
}))

afterEach(() => { jest.useRealTimers() })

describe('DashboardLoadState', () => {
  it("affiche une erreur avec « Réessayer » quand le chargement échoue", async () => {
    const onRetry = jest.fn().mockResolvedValue()
    render(<DashboardLoadState error={new Error('HTTP 500')} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger les chantiers')
    expect(screen.queryByTestId('skeleton')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("parle de réseau quand l'erreur vient du réseau", () => {
    render(<DashboardLoadState error={new TypeError('Failed to fetch')} onRetry={jest.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Pas de réseau')
  })

  it('hors ligne : squelette, puis avis après un court délai', () => {
    jest.useFakeTimers()
    render(<DashboardLoadState paused onRetry={jest.fn()} />)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { jest.advanceTimersByTime(PAUSED_NOTICE_MS) })
    expect(screen.getByRole('status')).toHaveTextContent('Pas de réseau')
  })

  it('chargement long : avis au bout de quelques secondes seulement', () => {
    jest.useFakeTimers()
    render(<DashboardLoadState onRetry={jest.fn()} />)
    act(() => { jest.advanceTimersByTime(SLOW_NOTICE_MS - 1) })
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { jest.advanceTimersByTime(1) })
    expect(screen.getByRole('status')).toHaveTextContent('plus de temps que prévu')
  })
})
