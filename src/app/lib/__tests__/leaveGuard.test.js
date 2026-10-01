import { holdLeaveGuard, activeLeaveGuards, BACK_BLOCKED_EVENT } from '../leaveGuard'

describe('leaveGuard', () => {
  afterEach(() => { while (activeLeaveGuards()) holdLeaveGuard()() })

  it('fermeture / rechargement de la page : confirmation demandée tant qu’une fenêtre est ouverte', () => {
    const release = holdLeaveGuard()
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    release()
    const e2 = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e2)
    expect(e2.defaultPrevented).toBe(false)
  })

  it('retour du téléphone : la fenêtre reste ouverte et un message est émis', () => {
    const blocked = jest.fn()
    window.addEventListener(BACK_BLOCKED_EVENT, blocked)
    const release = holdLeaveGuard()
    expect(window.history.state).toEqual(expect.objectContaining({ idmGuard: true }))
    const push = jest.spyOn(window.history, 'pushState')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ idmGuard: true }), '')
    expect(blocked).toHaveBeenCalledTimes(1)
    push.mockRestore()
    release()
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(blocked).toHaveBeenCalledTimes(1)
    window.removeEventListener(BACK_BLOCKED_EVENT, blocked)
  })

  it('plusieurs fenêtres : protégé jusqu’à la fermeture de la dernière ; une seule entrée d’historique', () => {
    const push = jest.spyOn(window.history, 'pushState')
    const a = holdLeaveGuard()
    const b = holdLeaveGuard()
    expect(activeLeaveGuards()).toBe(2)
    a(); a()
    expect(activeLeaveGuards()).toBe(1)
    expect(document.documentElement.style.overscrollBehaviorY).toBe('none')
    b()
    expect(activeLeaveGuards()).toBe(0)
    expect(document.documentElement.style.overscrollBehaviorY).toBe('')
    holdLeaveGuard()()
    expect(push.mock.calls.length).toBeLessThanOrEqual(1)
    push.mockRestore()
  })
})
