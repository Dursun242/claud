import { act, renderHook } from '@testing-library/react'

// Mock du toast : on veut vérifier que le hook l'appelle avec la bonne
// forme, pas tester l'intégration UI. La vraie implémentation vit dans
// ToastContext et a ses propres tests.
const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast }),
}))

// Import APRÈS jest.mock() — ordre important, sinon le mock n'est pas pris
// en compte à l'intérieur du hook.
// eslint-disable-next-line import/first
import { useUndoableDelete } from '../useUndoableDelete'

beforeEach(() => {
  addToast.mockClear()
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

describe('useUndoableDelete', () => {
  it('état initial : pendingIds est un Set vide', () => {
    const { result } = renderHook(() => useUndoableDelete({ onConfirmDelete: jest.fn() }))
    expect(result.current.pendingIds).toBeInstanceOf(Set)
    expect(result.current.pendingIds.size).toBe(0)
  })

  it("scheduleDelete ajoute l'id aux pendingIds immédiatement", () => {
    const { result } = renderHook(() =>
      useUndoableDelete({ onConfirmDelete: jest.fn() })
    )

    act(() => { result.current.scheduleDelete({ id: 42 }) })
    expect(result.current.pendingIds.has(42)).toBe(true)
  })

  it('affiche un toast avec une action "Annuler" pendant la fenêtre d\'undo', () => {
    const { result } = renderHook(() =>
      useUndoableDelete({ label: 'Tâche', onConfirmDelete: jest.fn(), delay: 5000 })
    )

    act(() => { result.current.scheduleDelete({ id: 1 }, { itemLabel: 'Ma tâche' }) })

    expect(addToast).toHaveBeenCalledTimes(1)
    const [msg, level, opts] = addToast.mock.calls[0]
    expect(msg).toMatch(/Ma tâche supprimé/)
    expect(level).toBe('success')
    expect(opts.duration).toBe(5000)
    expect(opts.action.label).toBe('Annuler')
    expect(typeof opts.action.onClick).toBe('function')
  })

  it('cliquer "Annuler" retire l\'id des pendingIds et n\'appelle PAS onConfirmDelete', () => {
    const onConfirmDelete = jest.fn()
    const { result } = renderHook(() => useUndoableDelete({ onConfirmDelete, delay: 5000 }))

    act(() => { result.current.scheduleDelete({ id: 7 }) })
    expect(result.current.pendingIds.has(7)).toBe(true)

    // Récupère la callback undo passée au toast et la déclenche
    const undo = addToast.mock.calls[0][2].action.onClick
    act(() => { undo() })

    expect(result.current.pendingIds.has(7)).toBe(false)

    // Même après l'expiration du timer, onConfirmDelete ne doit plus être appelé
    act(() => { jest.advanceTimersByTime(10000) })
    expect(onConfirmDelete).not.toHaveBeenCalled()
  })

  it('au bout du délai, onConfirmDelete est appelé avec l\'item', async () => {
    const onConfirmDelete = jest.fn().mockResolvedValue()
    const { result } = renderHook(() => useUndoableDelete({ onConfirmDelete, delay: 5000 }))

    const item = { id: 99, titre: 'Test' }
    act(() => { result.current.scheduleDelete(item) })

    // Le delete n'a pas encore eu lieu
    expect(onConfirmDelete).not.toHaveBeenCalled()

    // On avance dans le temps au-delà du délai
    await act(async () => {
      jest.advanceTimersByTime(5000)
      // Laisse les microtasks (promesse du await) se résoudre
      await Promise.resolve()
    })

    expect(onConfirmDelete).toHaveBeenCalledWith(item)
  })

  it("si onConfirmDelete jette, l'item réapparaît et un toast d'erreur est affiché", async () => {
    const onConfirmDelete = jest.fn().mockRejectedValue(new Error('DB down'))
    const { result } = renderHook(() => useUndoableDelete({ onConfirmDelete, delay: 100 }))

    act(() => { result.current.scheduleDelete({ id: 123 }) })
    expect(result.current.pendingIds.has(123)).toBe(true)

    await act(async () => {
      jest.advanceTimersByTime(200)
      await Promise.resolve(); await Promise.resolve()
    })

    // L'item doit réapparaître (retiré de pendingIds)
    expect(result.current.pendingIds.has(123)).toBe(false)

    // Un toast d'erreur supplémentaire a été émis
    const errorCalls = addToast.mock.calls.filter(c => c[1] === 'error')
    expect(errorCalls).toHaveLength(1)
    expect(errorCalls[0][0]).toMatch(/DB down/)
  })

  it("ignore les items sans id (garde-fou)", () => {
    const onConfirmDelete = jest.fn()
    const { result } = renderHook(() => useUndoableDelete({ onConfirmDelete }))

    act(() => { result.current.scheduleDelete(null) })
    act(() => { result.current.scheduleDelete({}) })

    expect(result.current.pendingIds.size).toBe(0)
    expect(addToast).not.toHaveBeenCalled()
  })
})
