import { formatDate, statusColor, decisionColor } from '../pvStatusHelpers'

describe('formatDate', () => {
  it("renvoie '—' quand la date est absente", () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('formate une date ISO en format FR court', () => {
    // toLocaleDateString peut varier par OS/locale → on vérifie le pattern
    // plutôt que la string exacte.
    const out = formatDate('2026-04-20')
    expect(out).toMatch(/20/)           // le jour
    expect(out).toMatch(/2026/)          // l'année
    expect(out).toMatch(/avr/i)          // le mois court "avr."
  })
})

describe('statusColor', () => {
  it('renvoie un vert pour "Signé"', () => {
    expect(statusColor('Signé')).toEqual({ bg: '#EAF8EE', color: '#1E7B34' })
  })

  it('renvoie le fallback neutre pour un statut inconnu', () => {
    expect(statusColor('InexistantÉtat')).toEqual({ bg: '#F2F2F7', color: '#6E6E73' })
  })

  it('couvre tous les statuts documentés', () => {
    for (const s of ['Signé', 'Envoyé', 'Brouillon', 'Refusé']) {
      const c = statusColor(s)
      expect(c.bg).toMatch(/^#[0-9A-F]{6}$/i)
      expect(c.color).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})

describe('decisionColor', () => {
  it('différencie "Accepté" et "Accepté avec réserve"', () => {
    const ok = decisionColor('Accepté')
    const warn = decisionColor('Accepté avec réserve')
    expect(ok.color).not.toBe(warn.color)
  })

  it('renvoie le rouge pour "Refusé"', () => {
    expect(decisionColor('Refusé')).toMatchObject({ color: '#D70015' })
  })
})
