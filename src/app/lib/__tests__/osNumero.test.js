import { nextOsNumero } from '../osNumero'

const now = new Date(2027, 0, 15)

describe('nextOsNumero', () => {
  it('commence à 001 sans OS', () => {
    expect(nextOsNumero([], now)).toBe('OS-2027-001')
    expect(nextOsNumero(undefined, now)).toBe('OS-2027-001')
  })

  it('suit le plus grand numéro, tous chantiers confondus', () => {
    const os = [
      { numero: 'OS-2026-007', chantier_id: 'a' },
      { numero: 'OS-2026-012', chantier_id: 'b' },
      { numero: 'OS-2026-003', chantier_id: 'a' },
    ]
    expect(nextOsNumero(os, now)).toBe('OS-2027-013')
  })

  it("prend l'année en cours", () => {
    expect(nextOsNumero([{ numero: 'OS-2026-041' }], new Date(2026, 5, 1))).toBe('OS-2026-042')
  })

  it('ignore les numéros sans chiffre final', () => {
    expect(nextOsNumero([{ numero: 'OS-XXXX' }, { numero: null }, {}], now)).toBe('OS-2027-001')
  })
})
