import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import CRIntervenantsPicker from '../CRIntervenantsPicker'

const available = [
  { nom: 'Martin', societe: 'Martin Élec', email: 'm@ex.fr' },
  { nom: 'Durand', societe: 'Durand Plomberie', email: 'd@ex.fr' },
  { nom: 'Leroy', email: 'l@ex.fr' },
]

function Harness({ m = false, initial, onChange }) {
  const [value, setValue] = useState(initial)
  return <CRIntervenantsPicker m={m} available={available} value={value} onChange={(v) => { setValue(v); onChange(v) }} />
}
const order = () => screen.getAllByTestId('cr-intervenant').map(el => el.textContent.match(/Martin|Durand|Leroy/)[0])

describe('CRIntervenantsPicker — ordre', () => {
  const initial = [{ nom: 'Durand', convoque: true }, { nom: 'Martin', convoque: true }]

  it('les cochés d’abord, dans l’ordre du CR', () => {
    render(<Harness initial={initial} onChange={jest.fn()} />)
    expect(order()).toEqual(['Durand', 'Martin', 'Leroy'])
  })

  it('flèches du clavier sur la poignée : nouvel ordre enregistré dans le CR', () => {
    const onChange = jest.fn()
    render(<Harness initial={initial} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('button', { name: /Déplacer Martin/ }), { key: 'ArrowUp' })
    expect(order()).toEqual(['Martin', 'Durand', 'Leroy'])
    expect(onChange.mock.calls.at(-1)[0].map(v => v.nom)).toEqual(['Martin', 'Durand'])
  })

  it('téléphone : boutons monter / descendre, l’ordre reste après avoir coché', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Harness m initial={initial} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Monter Leroy' }))
    expect(order()).toEqual(['Durand', 'Leroy', 'Martin'])
    await user.click(screen.getByRole('checkbox', { name: /^Leroy/ }))
    expect(onChange.mock.calls.at(-1)[0].map(v => v.nom)).toEqual(['Durand', 'Leroy', 'Martin'])
    expect(screen.getByRole('button', { name: 'Monter Durand' })).toBeDisabled()
  })
})
