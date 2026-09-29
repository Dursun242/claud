import { upsertById, removeById, patchById } from '../cacheList'

describe('cacheList', () => {
  const list = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]

  it('upsertById remplace sur place ou ajoute en tête', () => {
    expect(upsertById(list, { id: 'b', n: 20 })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 20 }])
    expect(upsertById(list, { id: 'c', n: 3 })[0]).toEqual({ id: 'c', n: 3 })
    expect(upsertById(list, null)).toBe(list)
    expect(upsertById(undefined, { id: 'x' })).toEqual([{ id: 'x' }])
  })

  it('removeById / patchById', () => {
    expect(removeById(list, 'a')).toEqual([{ id: 'b', n: 2 }])
    expect(patchById(list, 'a', x => ({ n: x.n + 10 }))).toEqual([{ id: 'a', n: 11 }, { id: 'b', n: 2 }])
    expect(list).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]) // pas de mutation
  })
})
