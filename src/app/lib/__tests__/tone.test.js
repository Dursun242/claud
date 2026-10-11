import { toneText, toneBg } from '../tone'

describe('tone', () => {
  it('assombrit les couleurs de statut iOS', () => {
    expect(toneText('#FF9500')).toBe('#C93400')
    expect(toneText('#ff3b30')).toBe('#D70015')
    expect(toneText('#007AFF')).toBe('#0062CC')
    expect(toneText('#34C759')).toBe('#1E7B34')
  })
  it('garde les anciennes couleurs lisibles', () => {
    expect(toneText('#F59E0B')).toBe('#C93400')
  })
  it('garde une couleur inconnue', () => {
    expect(toneText('#123456')).toBe('#123456')
  })
  it('fond dilué à 9 %, gris si la couleur est invalide', () => {
    expect(toneBg('#34C759')).toBe('#34C75918')
    expect(toneBg('red')).toBe('#F2F2F7')
    expect(toneBg(undefined)).toBe('#F2F2F7')
  })
})
