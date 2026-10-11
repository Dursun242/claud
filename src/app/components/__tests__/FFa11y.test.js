import { render, screen } from '@testing-library/react'
import { FF } from '../../dashboards/shared'
import AddressPicker from '../AddressPicker'

describe('FF : étiquettes reliées aux champs', () => {
  it('relie l’étiquette au champ d’adresse (composant AddressPicker)', () => {
    render(<FF label="Adresse"><AddressPicker value="" onChange={() => {}} /></FF>)
    expect(screen.getByRole('combobox', { name: 'Adresse' })).toBeInTheDocument()
  })

  it('erreur : champ marqué invalide et décrit par le message', () => {
    render(<FF label="Email" error="Adresse invalide"><input /></FF>)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Adresse invalide')
  })
})
