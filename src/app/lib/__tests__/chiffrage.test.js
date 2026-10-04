import { osHT, lotOptions, normalizeMetre, refsIndex, refFor, normalizeLots, lotTotal, chiffrageTotals, suggestLot, compareWithOs, sanityChecks, osPriceRefs, chiffrageCsvRows } from '../chiffrage'

const LOTS = normalizeLots([
  { nom: 'Gros œuvre', postes: [
    { designation: 'Fondations', quantite: 1, unite: 'ens', pu_ht: 12000 },
    { designation: 'Murs parpaings', quantite: '120,5', unite: 'm²', pu_ht: '85' },
  ] },
  { nom: 'Électricité', postes: [{ designation: 'Installation complète', quantite: 1, unite: 'ens', pu_ht: 9000 }] },
  { nom: 'Plomberie - sanitaires', postes: [{ designation: 'Réseaux et appareils', quantite: 1, unite: 'ens', pu_ht: 7000 }] },
])

describe('chiffrage estimatif', () => {
  it('normalise (nombres « 120,5 », identifiants, lots vides retirés)', () => {
    expect(LOTS[0].postes[1]).toMatchObject({ quantite: 120.5, pu_ht: 85, unite: 'm²' })
    expect(LOTS[0].id).toBeTruthy()
    expect(normalizeLots([{ nom: '', postes: [] }, null])).toEqual([])
  })

  it('totaux : HT, aléas, TVA, TTC, €/m²', () => {
    expect(lotTotal(LOTS[0])).toBe(22242.5)
    expect(chiffrageTotals({ lots: LOTS, aleas_pct: 5, tva_pct: 20, surface_m2: 100 }))
      .toEqual({ ht: 38242.5, aleas: 1912.13, htAleas: 40154.63, tva: 8030.93, ttc: 48185.56, parM2: 402 })
  })

  it('rattache un artisan au lot probable', () => {
    expect(suggestLot('Électricien', LOTS)).toBe('Électricité')
    expect(suggestLot('Plombier chauffagiste', LOTS)).toBe('Plomberie - sanitaires')
    expect(suggestLot('Maçonnerie générale', LOTS)).toBe('Gros œuvre')
    expect(suggestLot('Couvreur', LOTS)).toBeNull()
    expect(suggestLot('', LOTS)).toBeNull()
  })

  it('compare estimé / engagé par lot (OS engagés HT), OS sans lot, lot hors chiffrage', () => {
    const os = [
      { lot: 'Gros œuvre', statut: 'Signé', montant_ht: 25000 },
      { lot: 'gros oeuvre', statut: 'Terminé', montant_ht: 1000 },
      { lot: 'Électricité', statut: 'Brouillon', montant_ht: 8000 },
      { lot: 'Électricité', statut: 'Annulé', montant_ht: 99999 },
      { lot: '', statut: 'Signé', montant_ht: 3000, numero: 'OS-9' },
      { lot: 'Couverture', statut: 'Signé', montant_ht: 6000 },
    ]
    const c = compareWithOs({ lots: LOTS, os, aleas_pct: 0 })
    expect(c.lignes[0]).toMatchObject({ nom: 'Gros œuvre', estime: 22242.5, engage: 26000, nbOs: 2, ecart: 3757.5, pct: 117 })
    expect(c.lignes[1]).toMatchObject({ nom: 'Électricité', engage: 0, brouillon: 8000, pct: 0 })
    expect(c.lignes.find(l => l.nom === 'Couverture')).toMatchObject({ horsChiffrage: true, engage: 6000 })
    expect(c.sansLot).toMatchObject({ engage: 3000, nb: 1 })
    expect(c.totaux).toMatchObject({ estime: 38242.5, engage: 35000 })
  })

  it('bon sens : prix manquants, doublons, coût au m², aléas', () => {
    const lots = normalizeLots([
      { nom: 'A', postes: [{ designation: 'X', quantite: 1, pu_ht: 0 }, { designation: 'Y', quantite: 0, pu_ht: 10 }, { designation: 'Y', quantite: 1, pu_ht: 10 }] },
    ])
    const w = sanityChecks({ lots, surface_m2: 100 })
    expect(w).toEqual(expect.arrayContaining([
      'Lot « A » : 1 poste sans quantité.',
      'Lot « A » : poste en double « Y ».',
      expect.stringMatching(/bas pour une construction/),
      'Aucune provision pour aléas : 5 à 10 % est d’usage.',
    ]))
    expect(sanityChecks({ lots: LOTS, surface_m2: 10, aleas_pct: 5 })).toEqual([expect.stringMatching(/élevé pour une maison individuelle/)])
  })

  it('prix de référence tirés des OS (dédoublonnés, récents d’abord) et export tableur', () => {
    const refs = osPriceRefs([
      { date_emission: '2026-01-01', artisan_specialite: 'Peintre', prestations: [{ description: 'Peinture murs', unite: 'm²', prix_unitaire: 22 }] },
      { date_emission: '2026-06-01', artisan_specialite: 'Peintre', prestations: [{ description: 'Peinture murs', unite: 'm²', prix_unitaire: 25 }, { description: '', prix_unitaire: 5 }] },
    ])
    expect(refs).toEqual([{ designation: 'Peinture murs', unite: 'm²', pu_ht: 25, nb: 2, min: 22, max: 25, metier: 'Peintre' }])
    const idx = refsIndex(refs)
    expect(refFor(idx, { designation: 'peinture murs ', unite: 'm²' })).toMatchObject({ pu_ht: 25, nb: 2 })
    expect(refFor(idx, { designation: 'Peinture murs', unite: 'ml' })).toBeNull()
    expect(normalizeMetre([{ element: ' Surface de plancher ', quantite: '110,5', unite: 'm²', source: 'PCMI tableau' }, { element: '' }]))
      .toEqual([{ element: 'Surface de plancher', quantite: 110.5, unite: 'm²', source: 'PCMI tableau' }])
    const rows = chiffrageCsvRows({ lots: LOTS, aleas_pct: 5, tva_pct: 20 })
    expect(rows[0]).toEqual(['Lot', 'Désignation', 'Quantité', 'Unité', 'PU HT', 'Total HT'])
    expect(rows[2]).toEqual(['Gros œuvre', 'Murs parpaings', '120,5', 'm²', '85', '10242,5'])
    expect(rows[rows.length - 1]).toEqual(['Total TTC', '', '', '', '', '48185,56'])
  })

  it('OS saisi en TTC seul : HT déduit ; lots proposés pour un OS', () => {
    expect(osHT({ montant_ht: 0, montant_ttc: 1200 })).toBe(1000)
    expect(osHT({ montant_ttc: 1200, tva_non_applicable: true })).toBe(1200)
    expect(osHT({ montant_ht: 900, montant_ttc: 1200 })).toBe(900)
    expect(lotOptions({ lots: [{ nom: 'A' }] }, { lots: ['B'] })).toEqual(['A'])
    expect(lotOptions(null, { lots: ['B'] })).toEqual(['B'])
    expect(suggestLot('Électricien', ['Plomberie', 'Électricité CFO'])).toBe('Électricité CFO')
  })
})
