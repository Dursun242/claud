import { renderHook, act } from '@testing-library/react'
import { useNavReturn } from '../useNavReturn'

const setup = (openId, back) => renderHook(
  ({ openId, back }) => useNavReturn(openId, back),
  { initialProps: { openId, back } },
)

describe('useNavReturn', () => {
  it('fiche ouverte depuis une autre page : la fermer ramène à la page d’origine', () => {
    const back = { label: 'Tableau de bord', go: jest.fn() }
    const { result, rerender } = setup(null, back)
    // la page ouvre la fiche et la marque dans le même rendu
    act(() => { result.current.markFromNav('o1'); rerender({ openId: 'o1', back }) })
    result.current.returnIfFromNav()
    expect(back.go).toHaveBeenCalledTimes(1)
  })

  it('fiche ouverte à la main : pas de retour', () => {
    const back = { label: 'Tableau de bord', go: jest.fn() }
    const { result } = setup('o2', back)
    result.current.returnIfFromNav()
    expect(back.go).not.toHaveBeenCalled()
  })

  it('autre fiche ouverte ensuite : le retour est annulé', () => {
    const back = { label: 'Tableau de bord', go: jest.fn() }
    const { result, rerender } = setup(null, back)
    // la page ouvre la fiche et la marque dans le même rendu
    act(() => { result.current.markFromNav('o1'); rerender({ openId: 'o1', back }) })
    rerender({ openId: 'o2', back })
    rerender({ openId: 'o1', back })
    result.current.returnIfFromNav()
    expect(back.go).not.toHaveBeenCalled()
  })

  it('sans page d’origine : rien', () => {
    const { result, rerender } = setup(null, null)
    act(() => result.current.markFromNav('o1'))
    rerender({ openId: 'o1', back: null })
    expect(() => result.current.returnIfFromNav()).not.toThrow()
  })
})
