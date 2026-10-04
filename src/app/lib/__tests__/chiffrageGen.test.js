import { genererDpgf } from '../chiffrageGen'

const TRAME = {
  lots: ['GO', 'PLACO', 'PEINTURE', 'ELEC', 'PLOMBERIE'].map(nom => ({ nom, contenu: `contenu ${nom}` })),
  metre_cle: [{ element: 'SHAB', quantite: 120, unite: 'm²' }], surface_m2: 120,
  hypotheses: ['h'], non_compris: ['piscine'], conseils: [], ia: 'mistral',
}

describe('génération du DPGF en deux temps', () => {
  it('trame puis lots en parallèle (4 au plus), ordre conservé, progression', async () => {
    let enCours = 0, max = 0
    const post = jest.fn(async (b) => {
      if (b.action === 'trame') return TRAME
      enCours += 1; max = Math.max(max, enCours)
      await new Promise(r => setTimeout(r, 5))
      enCours -= 1
      return { postes: [{ designation: `poste ${b.lot.nom}`, quantite: 1, unite: 'u', pu_ht: 10 }], ia: 'mistral' }
    })
    const progres = []
    const r = await genererDpgf(post, { description: 'Maison', refs: [{ x: 1 }], chantierId: 'c1', lots: ['GO'] }, { onProgress: p => progres.push(p) })
    expect(max).toBe(4)
    expect(r.lots.map(l => l.postes[0].designation)).toEqual(TRAME.lots.map(l => `poste ${l.nom}`))
    expect(r).toMatchObject({ surface_m2: 120, hypotheses: ['h'], non_compris: ['piscine'], echecs: [], ia: 'Mistral' })
    expect(progres[0]).toEqual({ etape: 'trame' })
    expect(progres.at(-1)).toEqual({ etape: 'lots', fait: 5, total: 5 })
    const lotCall = post.mock.calls.find(c => c[0].action === 'lot')[0]
    expect(lotCall).toMatchObject({ chantierId: 'c1', metre_cle: TRAME.metre_cle, hypotheses: ['h'], refs: [{ x: 1 }], surface_m2: 120 })
    expect(lotCall.autres_lots).toHaveLength(4)
    expect(lotCall.lots).toBeUndefined()
  })

  it('lot en échec : un nouvel essai, puis lot vide signalé ; tous en échec → erreur', async () => {
    const essais = {}
    const post = jest.fn(async (b) => {
      if (b.action === 'trame') return { ...TRAME, lots: TRAME.lots.slice(0, 2) }
      essais[b.lot.nom] = (essais[b.lot.nom] || 0) + 1
      if (b.lot.nom === 'PLACO') throw new Error('503')
      if (essais.GO === 1) throw new Error('timeout')
      return { postes: [{ designation: 'x', quantite: 1, unite: 'u', pu_ht: 1 }], ia: 'anthropic' }
    })
    const r = await genererDpgf(post, { description: 'Maison' })
    expect(essais).toEqual({ GO: 2, PLACO: 2 })
    expect(r.lots[1]).toEqual({ nom: 'PLACO', postes: [] })
    expect(r.echecs).toEqual(['PLACO'])
    expect(r.ia).toBe('Mistral + Claude')
    await expect(genererDpgf(async (b) => { if (b.action === 'trame') return TRAME; throw new Error('x') }, {})).rejects.toThrow(/impossible/)
  })
})
