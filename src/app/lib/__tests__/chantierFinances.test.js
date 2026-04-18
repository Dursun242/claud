import { computeChantierFinances } from '../chantierFinances'

describe('computeChantierFinances', () => {
  it('retourne tout à zéro pour un chantier vierge', () => {
    const f = computeChantierFinances(0, [])
    expect(f.budget).toBe(0)
    expect(f.engageMontant).toBe(0)
    expect(f.engageCount).toBe(0)
    expect(f.realiseMontant).toBe(0)
    expect(f.realiseCount).toBe(0)
    expect(f.brouillonMontant).toBe(0)
    expect(f.brouillonCount).toBe(0)
    expect(f.resteEngager).toBe(0)
    expect(f.depassement).toBe(0)
    expect(f.ratio).toBe(0)
  })

  it('catégorise un OS Brouillon comme brouillon, pas engagé', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Brouillon', montant_ttc: 2000 },
    ])
    expect(f.brouillonCount).toBe(1)
    expect(f.brouillonMontant).toBe(2000)
    expect(f.engageCount).toBe(0)
    expect(f.engageMontant).toBe(0)
  })

  it('ignore un OS Annulé (ni engagé, ni brouillon)', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Annulé', montant_ttc: 5000 },
    ])
    expect(f.engageCount).toBe(0)
    expect(f.brouillonCount).toBe(0)
  })

  it('compte un OS Émis / Signé / En cours comme engagé mais pas réalisé', () => {
    const os = [
      { statut: 'Émis', montant_ttc: 1000 },
      { statut: 'Signé', montant_ttc: 2000 },
      { statut: 'En cours', montant_ttc: 3000 },
    ]
    const f = computeChantierFinances(20000, os)
    expect(f.engageCount).toBe(3)
    expect(f.engageMontant).toBe(6000)
    expect(f.realiseCount).toBe(0)
    expect(f.realiseMontant).toBe(0)
  })

  it('compte un OS Terminé à la fois engagé ET réalisé', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Terminé', montant_ttc: 4000 },
    ])
    expect(f.engageCount).toBe(1)
    expect(f.engageMontant).toBe(4000)
    expect(f.realiseCount).toBe(1)
    expect(f.realiseMontant).toBe(4000)
  })

  it('calcule le ratio en pourcentage sans dépasser 100% en cas d underspend', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Émis', montant_ttc: 3000 },
    ])
    expect(f.ratio).toBe(30)
  })

  it('calcule un dépassement positif quand engagé > budget', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Signé', montant_ttc: 12000 },
    ])
    expect(f.depassement).toBe(2000)
    expect(f.resteEngager).toBe(0)
    expect(f.ratio).toBe(120)
  })

  it('calcule un reste à engager positif quand engagé < budget', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Signé', montant_ttc: 4000 },
    ])
    expect(f.resteEngager).toBe(6000)
    expect(f.depassement).toBe(0)
  })

  it('retourne ratio=0 si budget=0 (pas de division par zéro)', () => {
    const f = computeChantierFinances(0, [
      { statut: 'Signé', montant_ttc: 5000 },
    ])
    expect(f.ratio).toBe(0)
    expect(f.depassement).toBe(5000)
  })

  it('gère des montants string en les coerçant en Number', () => {
    const f = computeChantierFinances('10000', [
      { statut: 'Émis', montant_ttc: '3500' },
    ])
    expect(f.budget).toBe(10000)
    expect(f.engageMontant).toBe(3500)
  })

  it('considère un montant non numérique comme 0', () => {
    const f = computeChantierFinances(10000, [
      { statut: 'Émis', montant_ttc: 'n/a' },
    ])
    expect(f.engageMontant).toBe(0)
  })

  it('scénario mixte : budget partiellement consommé + brouillon en attente', () => {
    const f = computeChantierFinances(50000, [
      { statut: 'Brouillon', montant_ttc: 3000 },
      { statut: 'Émis', montant_ttc: 10000 },
      { statut: 'Signé', montant_ttc: 8000 },
      { statut: 'Terminé', montant_ttc: 5000 },
      { statut: 'Annulé', montant_ttc: 99999 },
    ])
    expect(f.brouillonMontant).toBe(3000)
    expect(f.brouillonCount).toBe(1)
    expect(f.engageMontant).toBe(23000) // émis + signé + terminé (pas brouillon ni annulé)
    expect(f.engageCount).toBe(3)
    expect(f.realiseMontant).toBe(5000)
    expect(f.realiseCount).toBe(1)
    expect(f.resteEngager).toBe(27000)
    expect(f.depassement).toBe(0)
    expect(f.ratio).toBe(46)
  })
})
