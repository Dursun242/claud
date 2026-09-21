import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddressPicker, { searchAddresses } from '../AddressPicker'

const feature = (name, postcode, city, type = 'housenumber') => ({
  properties: { id: `${name}-${postcode}`, label: `${name} ${postcode} ${city}`, name, postcode, city, type, context: '76, Seine-Maritime' },
  geometry: { coordinates: [0.1, 49.5] },
})

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [feature('9 Rue Henry Genestal', '76600', 'Le Havre'), feature('9 Rue Henri Barbusse', '76610', 'Le Havre')] }),
  })
})

describe('AddressPicker', () => {
  it('interroge la BAN après 3 caractères et propose les résultats', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const { rerender } = render(<AddressPicker value="" onChange={onChange} />)
    await user.type(screen.getByRole('combobox'), '9 r')
    // composant contrôlé : on simule le parent qui répercute la valeur
    rerender(<AddressPicker value="9 rue henry" onChange={onChange} />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(global.fetch.mock.calls[0][0]).toContain('q=9%20rue%20henry')
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('9 Rue Henry Genestal')).toBeInTheDocument()
  })

  it('la sélection renvoie le libellé complet et les champs séparés', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn(); const onSelect = jest.fn()
    render(<AddressPicker value="9 rue henry" onChange={onChange} onSelect={onSelect} />)
    await user.click((await screen.findAllByRole('option'))[0])
    expect(onChange).toHaveBeenCalledWith('9 Rue Henry Genestal 76600 Le Havre')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ rue: '9 Rue Henry Genestal', code_postal: '76600', ville: 'Le Havre' }))
  })

  it('fullLabel=false ne renvoie que la rue (pour les formulaires avec CP / ville séparés)', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<AddressPicker value="9 rue henri b" onChange={onChange} fullLabel={false} />)
    await user.click((await screen.findAllByRole('option'))[1])
    expect(onChange).toHaveBeenCalledWith('9 Rue Henri Barbusse')
  })

  it('reste saisissable si la BAN est indisponible', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 })
    render(<AddressPicker value="lieu-dit inconnu" onChange={jest.fn()} />)
    expect(await screen.findByText(/Suggestions indisponibles/)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('searchAddresses met en cache une requête identique', async () => {
    await act(async () => { await searchAddresses('cache test') })
    await act(async () => { await searchAddresses('Cache Test ') })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
