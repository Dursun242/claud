import { toneText, toneBg } from '../tone'

describe('tone', () => {
  it('assombrit les couleurs de statut connues', () => {
    expect(toneText('#F59E0B')).toBe('#B45309')
    expect(toneText('#ef4444')).toBe('#B91C1C')
    expect(toneText('#3B82F6')).toBe('#1D4ED8')
  })
  it('garde une couleur inconnue', () => {
    expect(toneText('#123456')).toBe('#123456')
  })
  it('fond dilué à 9 %, gris si la couleur est invalide', () => {
    expect(toneBg('#10B981')).toBe('#10B98118')
    expect(toneBg('red')).toBe('#F1F5F9')
    expect(toneBg(undefined)).toBe('#F1F5F9')
  })
})
