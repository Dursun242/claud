import { act, renderHook } from '@testing-library/react'
import { useFloatingMic } from '../useFloatingMic'

// jsdom n'expose pas SpeechRecognition : c'est pile le cas que le hook doit
// gérer en appelant onError(). On joue aussi avec l'assignation dynamique
// pour simuler un navigateur qui supporte l'API (Chrome-like).

describe('useFloatingMic', () => {
  const originalSR = window.SpeechRecognition
  const originalWebkit = window.webkitSpeechRecognition

  afterEach(() => {
    // Nettoyage : remet l'environnement comme on l'a trouvé, sinon les
    // tests suivants hériteraient de nos stubs.
    window.SpeechRecognition = originalSR
    window.webkitSpeechRecognition = originalWebkit
  })

  it('état initial : listening=false, transcript=""', () => {
    const { result } = renderHook(() => useFloatingMic())
    expect(result.current.listening).toBe(false)
    expect(result.current.transcript).toBe('')
  })

  it("appelle onError quand le navigateur n'expose pas SpeechRecognition", () => {
    // jsdom n'a pas SpeechRecognition par défaut → pas besoin de stub.
    const onError = jest.fn()
    const { result } = renderHook(() => useFloatingMic({ onError }))

    act(() => { result.current.toggle() })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatch(/non supportée/i)
    // Ne passe pas en "écoute" puisqu'on n'a pas pu démarrer.
    expect(result.current.listening).toBe(false)
  })

  it('ne crashe pas si onError est absent (juste un no-op silencieux)', () => {
    const { result } = renderHook(() => useFloatingMic())
    // Pas de throw, pas d'alert().
    expect(() => { act(() => { result.current.toggle() }) }).not.toThrow()
  })

  it("démarre la reconnaissance quand SpeechRecognition est disponible", () => {
    // Stub minimal mimant l'API : on capture l'instance pour simuler
    // ensuite onstart / onresult / onend depuis le test.
    const instances = []
    class FakeSR {
      constructor() {
        instances.push(this)
        this.start = jest.fn()
        this.stop = jest.fn()
      }
    }
    window.SpeechRecognition = FakeSR

    const { result } = renderHook(() => useFloatingMic())
    act(() => { result.current.toggle() })

    expect(instances).toHaveLength(1)
    expect(instances[0].start).toHaveBeenCalledTimes(1)

    // Quand Chrome appelle onstart → le hook bascule en listening=true
    act(() => { instances[0].onstart() })
    expect(result.current.listening).toBe(true)

    // onresult met à jour le transcript. Le hook itère depuis ev.resultIndex
    // et traite results[i][0].transcript comme texte final si isFinal=true.
    const makeResults = (arr) => arr.map(({ text, isFinal }) => {
      const r = [{ transcript: text }]
      r.isFinal = isFinal
      return r
    })
    act(() => {
      instances[0].onresult({
        resultIndex: 0,
        results: makeResults([{ text: 'Bonjour monde', isFinal: true }]),
      })
    })
    expect(result.current.transcript).toMatch(/Bonjour monde/)

    // onend → listening repasse à false
    act(() => { instances[0].onend() })
    expect(result.current.listening).toBe(false)
  })

  it("second appel à toggle() pendant l'écoute stoppe la reconnaissance", () => {
    const instances = []
    class FakeSR {
      constructor() {
        instances.push(this)
        this.start = jest.fn()
        this.stop = jest.fn()
      }
    }
    window.SpeechRecognition = FakeSR

    const { result } = renderHook(() => useFloatingMic())

    // Démarrage
    act(() => { result.current.toggle() })
    act(() => { instances[0].onstart() })
    expect(result.current.listening).toBe(true)

    // 2e clic → stop()
    act(() => { result.current.toggle() })
    expect(instances[0].stop).toHaveBeenCalledTimes(1)
    expect(result.current.listening).toBe(false)
  })

  it('notifie onError si le navigateur refuse le micro (not-allowed)', () => {
    const instances = []
    class FakeSR {
      constructor() {
        instances.push(this)
        this.start = jest.fn()
        this.stop = jest.fn()
      }
    }
    window.SpeechRecognition = FakeSR

    // Le hook logge volontairement avec console.error quand Chrome notifie
    // un error event — on le silence dans le test pour garder la sortie
    // Jest lisible (ce n'est pas la fonctionnalité qu'on teste ici).
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const onError = jest.fn()
    const { result } = renderHook(() => useFloatingMic({ onError }))
    act(() => { result.current.toggle() })

    // Simule l'évènement d'erreur natif de l'API Web Speech
    act(() => { instances[0].onerror({ error: 'not-allowed' }) })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatch(/bloqué/i)

    errSpy.mockRestore()
  })

  it('clear() réinitialise le transcript', () => {
    const { result } = renderHook(() => useFloatingMic())
    act(() => { result.current.setTranscript('du texte') })
    expect(result.current.transcript).toBe('du texte')

    act(() => { result.current.clear() })
    expect(result.current.transcript).toBe('')
  })
})
