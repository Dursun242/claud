import { act, renderHook } from '@testing-library/react'
import { ToastProvider, useToast, useToastList } from '../ToastContext'

// On utilise renderHook avec un wrapper ToastProvider pour exercer
// directement l'API publique du context sans passer par un composant UI.
const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>

// Double-hook pour observer actions + state côte à côte.
function useBoth() {
  const actions = useToast()
  const list = useToastList()
  return { ...actions, ...list }
}

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

describe('ToastContext', () => {
  it('useToast hors provider jette', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/)
    errSpy.mockRestore()
  })

  it('démarre avec une liste vide', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })
    expect(result.current.toasts).toEqual([])
  })

  it("addToast ajoute un toast avec id, message, type et duration par défaut", () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    act(() => { result.current.addToast('Hello') })

    expect(result.current.toasts).toHaveLength(1)
    const [t] = result.current.toasts
    expect(t).toMatchObject({ message: 'Hello', type: 'info', duration: 3000, action: null })
    expect(typeof t.id).toBe('number')
  })

  it('addToast accepte un type personnalisé ("success", "error", "warning"…)', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    act(() => { result.current.addToast('Fait', 'success') })
    expect(result.current.toasts[0].type).toBe('success')
  })

  it("auto-dismiss après la durée par défaut (3000 ms)", () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    act(() => { result.current.addToast('X') })
    expect(result.current.toasts).toHaveLength(1)

    act(() => { jest.advanceTimersByTime(3001) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('accepte une durée personnalisée (3e arg number, rétro-compat)', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    act(() => { result.current.addToast('X', 'info', 1000) })
    act(() => { jest.advanceTimersByTime(500) })
    expect(result.current.toasts).toHaveLength(1) // pas encore

    act(() => { jest.advanceTimersByTime(600) })
    expect(result.current.toasts).toHaveLength(0) // disparu
  })

  it('duration=0 rend le toast persistant (pas d\'auto-dismiss)', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    act(() => { result.current.addToast('Persistant', 'info', { duration: 0 }) })
    act(() => { jest.advanceTimersByTime(60_000) })
    expect(result.current.toasts).toHaveLength(1)
  })

  it("stocke l'objet action quand on passe { action: {...} }", () => {
    const { result } = renderHook(() => useBoth(), { wrapper })
    const onClick = jest.fn()

    act(() => {
      result.current.addToast('Supprimé', 'success', {
        duration: 5000,
        action: { label: 'Annuler', onClick },
      })
    })

    const [t] = result.current.toasts
    expect(t.action).toEqual({ label: 'Annuler', onClick })
  })

  it('removeToast supprime un toast par son id', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    let id
    act(() => { id = result.current.addToast('A', 'info', { duration: 0 }) })
    expect(result.current.toasts).toHaveLength(1)

    act(() => { result.current.removeToast(id) })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('addToast retourne un id unique même sur des appels simultanés', () => {
    const { result } = renderHook(() => useBoth(), { wrapper })

    const ids = new Set()
    act(() => {
      for (let i = 0; i < 10; i++) {
        ids.add(result.current.addToast(`#${i}`, 'info', { duration: 0 }))
      }
    })
    // 10 toasts, 10 ids distincts
    expect(ids.size).toBe(10)
    expect(result.current.toasts).toHaveLength(10)
  })
})
