import { renderHook, act } from '@testing-library/react'
import { usePrestationManager } from '../usePrestationManager'

describe('usePrestationManager', () => {
  it('démarre avec la liste initiale fournie', () => {
    const initial = [
      { description: 'Pose carrelage', unite: 'm²', quantite: '10', prix_unitaire: '50', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.prestations).toEqual(initial)
  })

  it('démarre vide si aucune liste initiale', () => {
    const { result } = renderHook(() => usePrestationManager())
    expect(result.current.prestations).toEqual([])
  })

  it('addPrestation ajoute une ligne vierge à la fin', () => {
    const { result } = renderHook(() => usePrestationManager([]))
    act(() => result.current.addPrestation())
    expect(result.current.prestations).toHaveLength(1)
    expect(result.current.prestations[0]).toEqual({
      description: '',
      unite: 'u',
      quantite: '',
      prix_unitaire: '',
      tva_taux: '20',
    })
  })

  it('removePrestation supprime la ligne à l index donné', () => {
    const initial = [
      { description: 'A', unite: 'u', quantite: '1', prix_unitaire: '10', tva_taux: '20' },
      { description: 'B', unite: 'u', quantite: '2', prix_unitaire: '20', tva_taux: '20' },
      { description: 'C', unite: 'u', quantite: '3', prix_unitaire: '30', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    act(() => result.current.removePrestation(1))
    expect(result.current.prestations).toHaveLength(2)
    expect(result.current.prestations.map(p => p.description)).toEqual(['A', 'C'])
  })

  it('updatePrestation modifie un seul champ d une seule ligne', () => {
    const initial = [
      { description: 'Ancien', unite: 'u', quantite: '1', prix_unitaire: '10', tva_taux: '20' },
      { description: 'Autre', unite: 'u', quantite: '1', prix_unitaire: '10', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    act(() => result.current.updatePrestation(0, 'description', 'Nouveau'))
    expect(result.current.prestations[0].description).toBe('Nouveau')
    expect(result.current.prestations[1].description).toBe('Autre')
    // Les autres champs de la ligne modifiée restent intacts
    expect(result.current.prestations[0].quantite).toBe('1')
  })

  it('totals commence à zéro sans prestations', () => {
    const { result } = renderHook(() => usePrestationManager([]))
    expect(result.current.totals).toEqual({ ht: 0, tva: 0, ttc: 0 })
  })

  it('totals calcule HT/TVA/TTC sur une ligne à 20 %', () => {
    const initial = [
      { description: 'x', unite: 'u', quantite: '2', prix_unitaire: '100', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.totals.ht).toBe(200)
    expect(result.current.totals.tva).toBe(40)
    expect(result.current.totals.ttc).toBe(240)
  })

  it('totals gère plusieurs lignes avec TVA différentes', () => {
    const initial = [
      { description: 'a', unite: 'u', quantite: '1', prix_unitaire: '100', tva_taux: '20' },   // 100 HT, 20 TVA
      { description: 'b', unite: 'u', quantite: '2', prix_unitaire: '50',  tva_taux: '10' },   // 100 HT, 10 TVA
      { description: 'c', unite: 'u', quantite: '1', prix_unitaire: '200', tva_taux: '5.5' },  // 200 HT, 11 TVA
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.totals.ht).toBe(400)
    expect(result.current.totals.tva).toBe(41)
    expect(result.current.totals.ttc).toBe(441)
  })

  it('totals considère TVA vide comme 20 % (défaut BTP)', () => {
    const initial = [
      { description: 'x', unite: 'u', quantite: '1', prix_unitaire: '100', tva_taux: '' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.totals.tva).toBe(20)
  })

  it('totals considère quantité ou prix non-numériques comme 0', () => {
    const initial = [
      { description: 'x', unite: 'u', quantite: 'abc', prix_unitaire: '100', tva_taux: '20' },
      { description: 'y', unite: 'u', quantite: '2',   prix_unitaire: 'n/a', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.totals.ht).toBe(0)
    expect(result.current.totals.ttc).toBe(0)
  })

  it('totals se recalcule après update d une quantité', () => {
    const initial = [
      { description: 'x', unite: 'u', quantite: '1', prix_unitaire: '100', tva_taux: '20' },
    ]
    const { result } = renderHook(() => usePrestationManager(initial))
    expect(result.current.totals.ht).toBe(100)
    act(() => result.current.updatePrestation(0, 'quantite', '5'))
    expect(result.current.totals.ht).toBe(500)
    expect(result.current.totals.ttc).toBe(600)
  })
})
