import {
  nameKey, phoneKey, duplicateReasons, findDuplicateGroups, pairKey, bestContact, planMerge,
} from '../contactDuplicates'

describe('clés de comparaison', () => {
  it('nom : civilité, forme juridique, accents, casse et ordre ignorés', () => {
    expect(nameKey('M. DEBRIS Julien')).toBe(nameKey('Julien Débris'))
    expect(nameKey('SARL Léon Grosse Travaux')).toBe(nameKey('leon grosse travaux'))
    expect(nameKey('Mme')).toBe('')
  })
  it('téléphone : +33 et 0 confondus', () => {
    expect(phoneKey('+33 6 12 34 56 78')).toBe(phoneKey('06.12.34.56.78'))
    expect(phoneKey('123')).toBe('')
  })
})

describe('duplicateReasons', () => {
  it('email, téléphone, nom, faute de frappe, SIRET', () => {
    expect(duplicateReasons({ nom: 'A', email: 'X@ex.fr' }, { nom: 'B', email: 'x@ex.fr ' })).toEqual(['même email'])
    expect(duplicateReasons({ nom: 'A', tel: '0612345678' }, { nom: 'B', tel_fixe: '+33612345678' })).toEqual(['même téléphone'])
    expect(duplicateReasons({ nom: 'Cousin Théau' }, { nom: 'Théau COUSIN' })).toEqual(['même nom'])
    expect(duplicateReasons({ nom: 'Njinou Ngninkeu' }, { nom: 'Njinou Ngninkue' })).toEqual([])
    expect(duplicateReasons({ nom: 'Plomberie Durand' }, { nom: 'Plomberie Durant' })).toEqual(['nom presque identique'])
    expect(duplicateReasons({ nom: 'Paul', siret: '921 536 181 00024' }, { nom: 'Marie', siret: '92153618100024' })).toEqual(['même SIRET'])
    expect(duplicateReasons({ nom: 'Paul Martin' }, { nom: 'Jean Martin' })).toEqual([])
  })
})

describe('findDuplicateGroups', () => {
  const contacts = [
    { id: '1', nom: 'M. DEBRIS Julien', email: 'debris.julien@hotmail.fr' },
    { id: '2', nom: 'Julien Debris', tel: '06 11 22 33 44' },
    { id: '3', nom: 'J. Debris', tel: '+33611223344' },
    { id: '4', nom: 'Cousin Théau', email: 'theau@ex.fr' },
    { id: '5', nom: 'Sophie Durand', email: 'sophie@ex.fr' },
    { id: '6', nom: 'Bureau', email: 'theau@ex.fr' },
  ]
  it('regroupe en chaîne (nom puis téléphone) et classe les plus sûrs d’abord', () => {
    const g = findDuplicateGroups(contacts)
    expect(g.map(x => x.ids.sort())).toEqual([['4', '6'], ['1', '2', '3']])
    expect(g[0].reasons).toEqual(['même email'])
    expect(g[1].reasons).toEqual(['même téléphone', 'même nom'])
  })
  it('paires ignorées', () => {
    const g = findDuplicateGroups(contacts, new Set([pairKey('4', '6')]))
    expect(g.map(x => x.ids.length)).toEqual([3])
  })
})

describe('fusion', () => {
  const a = { id: 'a', nom: 'Julien Debris', email: 'j@ex.fr', notes: 'Client fidèle', note: 3, created_at: '2025-01-01' }
  const b = { id: 'b', nom: 'M. DEBRIS Julien', email: 'J@EX.FR', tel: '0611223344', adresse: '3 rue X', ville: 'Le Havre', notes: 'Portail à revoir', note: 5, actif: false, created_at: '2026-01-01' }
  it('fiche la plus complète proposée', () => {
    expect(bestContact([a, b]).id).toBe('b')
  })
  it('champs complétés, notes regroupées, conflits listés', () => {
    const { fields, conflicts } = planMerge(a, [b])
    expect(fields).toMatchObject({ nom: 'Julien Debris', email: 'j@ex.fr', tel: '0611223344', ville: 'Le Havre', note: 5, actif: true })
    expect(fields.notes).toBe('Client fidèle\n\nPortail à revoir')
    // Email identique à la casse près : pas un conflit ; le nom oui
    expect(conflicts.map(c => c.key)).toEqual(['nom'])
    expect(conflicts[0].values).toEqual(['Julien Debris', 'M. DEBRIS Julien'])
  })
})
