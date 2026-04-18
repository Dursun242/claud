import { debounce } from '../debounce'

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('reporte l appel après le délai', () => {
    const fn = jest.fn()
    const d = debounce(fn, 200)
    d('hello')
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('hello')
  })

  it('n appelle que la dernière invocation si rafale dans la fenêtre', () => {
    const fn = jest.fn()
    const d = debounce(fn, 200)
    d('a')
    d('b')
    d('c')
    jest.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('.cancel() annule l appel en attente', () => {
    const fn = jest.fn()
    const d = debounce(fn, 200)
    d('x')
    d.cancel()
    jest.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })

  it('peut être rappelé après expiration de la fenêtre précédente', () => {
    const fn = jest.fn()
    const d = debounce(fn, 100)
    d('a')
    jest.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('a')
    d('b')
    jest.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('b')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('utilise la valeur par défaut de 200ms si aucune n est passée', () => {
    const fn = jest.fn()
    const d = debounce(fn)
    d('x')
    jest.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalled()
  })
})
