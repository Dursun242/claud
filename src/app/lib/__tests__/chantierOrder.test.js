import { sortChantiers, moveItem, orderPatches } from '../chantierOrder'

const list = [
  { id: 'a', ordre: 2, created_at: '2026-01-01' },
  { id: 'b', ordre: 1, created_at: '2026-02-01' },
  { id: 'c', ordre: null, created_at: '2026-03-01' },
  { id: 'd', created_at: '2026-04-01' },
]

describe('ordre des chantiers', () => {
  it('sans ordre en tête (plus récent d’abord), puis l’ordre choisi', () => {
    expect(sortChantiers(list).map(c => c.id)).toEqual(['d', 'c', 'b', 'a'])
    expect(sortChantiers(list, new Map([['a', 0]])).map(c => c.id)).toEqual(['d', 'c', 'a', 'b'])
  })
  it('déplacer puis n’enregistrer que ce qui change', () => {
    const sorted = sortChantiers(list)
    expect(moveItem(sorted, 3, 0).map(c => c.id)).toEqual(['a', 'd', 'c', 'b'])
    expect(moveItem(sorted, 0, 9)).toBe(sorted)
    const ranged = [{ id: 'x', ordre: 1 }, { id: 'y', ordre: 5 }, { id: 'z', ordre: 3 }]
    expect(orderPatches(ranged)).toEqual([{ id: 'y', ordre: 2 }])
    expect(orderPatches(ranged, new Map([['y', 2]]))).toEqual([])
  })
})
