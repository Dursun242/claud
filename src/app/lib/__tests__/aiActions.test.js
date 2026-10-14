import { parseAiActions, summarizeLabels, executeAiAction, computeOsTotals } from '../aiActions'

const mk = () => ({
  SB: {
    upsertChantier: jest.fn(), upsertTask: jest.fn(), upsertContact: jest.fn(),
    upsertCR: jest.fn(), upsertOS: jest.fn(),
  },
  crmDb: { upsertOpportunite: jest.fn(), upsertInteraction: jest.fn(), setActionFaite: jest.fn() },
})

describe('aiActions', () => {
  it('computeOsTotals additionne HT / TVA / TTC', () => {
    expect(computeOsTotals([{ quantite: 10, prix_unitaire: 100, tva_taux: 20 }, { quantite: 1, prix_unitaire: 50 }]))
      .toEqual({ montant_ht: 1050, montant_tva: 210, montant_ttc: 1260 })
  })

  it('dispatch les actions historiques vers SB', async () => {
    const deps = mk()
    expect(await executeAiAction({ type: 'add_task', data: { titre: 'x' } }, deps)).toBe('Tâche créée')
    expect(deps.SB.upsertTask).toHaveBeenCalledWith({ titre: 'x' })
    expect(await executeAiAction({ type: 'add_os', data: { prestations: [{ quantite: 1, prix_unitaire: 100 }] } }, deps))
      .toBe('Ordre de Service créé')
    expect(deps.SB.upsertOS).toHaveBeenCalledWith(expect.objectContaining({ montant_ttc: 120 }))
  })

  it('mode client : seule add_task passe, le CRM est refusé', async () => {
    const deps = mk()
    await expect(executeAiAction({ type: 'add_opportunite', data: {} }, { ...deps, clientMode: true }))
      .rejects.toThrow(/réservée/)
    await expect(executeAiAction({ type: 'add_task', data: {} }, { ...deps, clientMode: true })).resolves.toBe('Tâche créée')
  })

  it('add_opportunite ignore un id fourni par erreur, update_opportunite l’exige', async () => {
    const deps = mk()
    await executeAiAction({ type: 'add_opportunite', data: { id: 'bad', titre: 'T' } }, deps)
    expect(deps.crmDb.upsertOpportunite).toHaveBeenCalledWith({ titre: 'T' })
    await expect(executeAiAction({ type: 'update_opportunite', data: { titre: 'T' } }, deps)).rejects.toThrow(/id/)
  })

  it('add_interaction exige un rattachement ; action_faite coche la relance', async () => {
    const deps = mk()
    await expect(executeAiAction({ type: 'add_interaction', data: { sujet: 'x' } }, deps)).rejects.toThrow(/opportunite_id/)
    await executeAiAction({ type: 'add_interaction', data: { opportunite_id: 'o1', sujet: 'x' } }, deps)
    expect(deps.crmDb.upsertInteraction).toHaveBeenCalled()
    await executeAiAction({ type: 'action_faite', data: { id: 'i1' } }, deps)
    expect(deps.crmDb.setActionFaite).toHaveBeenCalledWith('i1', true)
  })

  it('action inconnue → erreur', async () => {
    await expect(executeAiAction({ type: 'nope' }, mk())).rejects.toThrow(/inconnue/)
  })
})

describe('parseAiActions : lecture des blocs de l’IA', () => {
  const t = (titre) => ({ type: 'add_task', data: { chantier_id: 'c1', titre } })
  it('un bloc, plusieurs blocs, une liste, une action dont data est une liste', () => {
    const one = parseAiActions(`Voici.\n<<<ACTION>>>\n${JSON.stringify(t('A'))}\n<<<END_ACTION>>>`)
    expect(one).toEqual({ actions: [t('A')], invalid: 0, text: 'Voici.' })
    const many = parseAiActions(`<<<ACTION>>>${JSON.stringify(t('A'))}<<<END_ACTION>>> et <<<ACTION>>>${JSON.stringify(t('B'))}<<<END_ACTION>>>`)
    expect(many.actions.map(a => a.data.titre)).toEqual(['A', 'B'])
    expect(parseAiActions(`<<<ACTION>>>${JSON.stringify([t('A'), t('B')])}<<<END_ACTION>>>`).actions).toHaveLength(2)
    const data = parseAiActions('<<<ACTION>>>{"type":"add_task","data":[{"titre":"A"},{"titre":"B"}]}<<<END_ACTION>>>')
    expect(data.actions).toEqual([{ type: 'add_task', data: { titre: 'A' } }, { type: 'add_task', data: { titre: 'B' } }])
  })
  it('objets à la suite, bloc ```json, virgules en trop, commentaires, bloc non fermé', () => {
    const body = '```json\n{"type":"add_task","data":{"titre":"A {x}",}}\n// suivante\n{"type":"add_task","data":{"titre":"B"}}\n```'
    expect(parseAiActions(`<<<ACTION>>>${body}<<<END_ACTION>>>`).actions.map(a => a.data.titre)).toEqual(['A {x}', 'B'])
    expect(parseAiActions(`<<<ACTION>>>${JSON.stringify(t('C'))}`).actions).toHaveLength(1)
  })
  it('morceau illisible compté, sans bloquer les autres', () => {
    const r = parseAiActions(`<<<ACTION>>>{"type":"add_task","data":{"titre":"A"}} {"type": oups}<<<END_ACTION>>>`)
    expect(r.actions).toHaveLength(1)
    expect(r.invalid).toBe(1)
    expect(parseAiActions('rien à faire').actions).toEqual([])
  })
  it('résumé des actions faites', () => {
    expect(summarizeLabels(['Tâche créée', 'Tâche créée', 'Contact créé'])).toBe('2 tâches créées, Contact créé')
  })
})
