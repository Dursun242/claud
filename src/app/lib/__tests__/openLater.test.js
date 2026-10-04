import { openLater } from '../openLater'

describe('openLater (onglet ouvert pendant le clic, adresse reçue ensuite)', () => {
  const realOpen = window.open
  afterEach(() => { window.open = realOpen })

  it('ouvre l’onglet tout de suite puis y charge le lien', async () => {
    const tab = { closed: false, location: { href: '' } }
    window.open = jest.fn(() => tab)
    const url = await openLater(async () => 'https://files/a.pdf')
    expect(window.open).toHaveBeenCalledWith('', '_blank')
    expect(tab.location.href).toBe('https://files/a.pdf')
    expect(url).toBe('https://files/a.pdf')
  })

  it('erreur : l’onglet vide est refermé et l’erreur remonte', async () => {
    const tab = { closed: false, location: { href: '' }, close: jest.fn() }
    window.open = jest.fn(() => tab)
    await expect(openLater(async () => { throw new Error('Lien indisponible') })).rejects.toThrow('Lien indisponible')
    expect(tab.close).toHaveBeenCalled()
  })
})
