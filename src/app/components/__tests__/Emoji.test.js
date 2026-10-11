import { render } from '@testing-library/react'
import Emoji from '../Emoji'
import { EMOJI } from '../../lib/emoji'

describe('Emoji', () => {
  it('affiche le repère dans une tuile, caché aux lecteurs d’écran', () => {
    const { container } = render(<Emoji e={EMOJI.os} />)
    const tile = container.firstChild
    expect(tile).toHaveTextContent('📋')
    expect(tile).toHaveAttribute('aria-hidden', 'true')
    expect(tile).toHaveStyle({ width: '28px', height: '28px' })
  })

  it('ne rend rien sans emoji', () => {
    const { container } = render(<Emoji />)
    expect(container.firstChild).toBeNull()
  })
})
