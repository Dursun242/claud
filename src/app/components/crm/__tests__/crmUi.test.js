import { defaultSujet, isAutoSujet, addDays, nextWeekday } from '../crmUi'

describe('crmUi', () => {
  it('defaultSujet : sujet selon le type et le contact', () => {
    expect(defaultSujet('Appel', { nom: 'Dupont' })).toBe('Appel avec Dupont')
    expect(defaultSujet('Visite', { nom: 'Dupont', societe: 'SCI Dupont' })).toBe('Visite chez SCI Dupont')
    expect(defaultSujet('Note', { nom: 'Dupont' })).toBe('Note sur Dupont')
    expect(defaultSujet('Email', null)).toBe('Email')
  })

  it('isAutoSujet : reconnaît les sujets générés, pas ceux saisis', () => {
    expect(isAutoSujet('')).toBe(true)
    expect(isAutoSujet('Appel avec Dupont')).toBe(true)
    expect(isAutoSujet('Visite chez SCI Dupont')).toBe(true)
    expect(isAutoSujet('Point sur le budget')).toBe(false)
  })

  it('addDays / nextWeekday renvoient des dates ISO futures', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(addDays(1) > today).toBe(true)
    const vendredi = nextWeekday(5)
    expect(vendredi > today).toBe(true)
    expect(new Date(vendredi + 'T12:00:00').getDay()).toBe(5)
  })
})
