import { executeAiAction, computeOsTotals } from '../aiActions'

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
