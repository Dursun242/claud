import { render, screen, fireEvent, act } from '@testing-library/react'
import FloatingMic, { COMPACT_IDLE_MS } from '../FloatingMic'

// jsdom ne gère pas scrollTop : on le pilote à la main
function scrollTo(el, top) {
  Object.defineProperty(el, 'scrollTop', { value: top, configurable: true })
  fireEvent.scroll(el)
}

function setup(props = {}) {
  const utils = render(
    <>
      <main data-testid="main" style={{ overflowY: 'auto' }} />
      <FloatingMic listening={false} onClick={jest.fn()} isMobile bottomOffset={62} {...props} />
    </>
  )
  return { ...utils, main: screen.getByTestId('main'), mic: screen.getByTestId('floating-mic') }
}

describe('FloatingMic — défilement', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('se réduit pendant le défilement vers le bas puis reprend sa taille à l’arrêt', () => {
    const { main, mic } = setup()
    expect(mic).toHaveAttribute('data-compact', 'false')

    scrollTo(main, 0)
    scrollTo(main, 120)
    expect(mic).toHaveAttribute('data-compact', 'true')
    expect(mic.style.opacity).toBe('0.45')
    expect(mic.style.transform).toBe('scale(0.7)')

    act(() => { jest.advanceTimersByTime(COMPACT_IDLE_MS - 50) })
    expect(mic).toHaveAttribute('data-compact', 'true')
    act(() => { jest.advanceTimersByTime(100) })
    expect(mic).toHaveAttribute('data-compact', 'false')
    expect(mic.style.opacity).toBe('1')
  })

  it('reprend sa taille dès le défilement vers le haut', () => {
    const { main, mic } = setup()
    scrollTo(main, 0)
    scrollTo(main, 200)
    expect(mic).toHaveAttribute('data-compact', 'true')
    scrollTo(main, 150)
    expect(mic).toHaveAttribute('data-compact', 'false')
  })

  it('reste pleine taille pendant l’écoute (dictée inchangée)', () => {
    const onClick = jest.fn()
    const { main, mic } = setup({ listening: true, transcript: 'bonjour', onClick })
    scrollTo(main, 0)
    scrollTo(main, 200)
    expect(mic).toHaveAttribute('data-compact', 'false')
    fireEvent.click(screen.getByRole('button', { name: "Arrêter l'écoute vocale" }))
    expect(onClick).toHaveBeenCalled()
  })

  it('sans animation si prefers-reduced-motion', () => {
    const orig = window.matchMedia
    window.matchMedia = jest.fn().mockReturnValue({ matches: true })
    try {
      const { mic } = setup()
      expect(mic.style.transition).toBe('none')
    } finally {
      window.matchMedia = orig
    }
  })

  it('retire l’écouteur au démontage', () => {
    const spy = jest.spyOn(document, 'removeEventListener')
    const { unmount } = setup()
    unmount()
    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function), { capture: true })
    spy.mockRestore()
  })
})
