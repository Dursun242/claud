import { osHT, lotOptions, normalizeMetre, refsIndex, refFor, normalizeLots, lotTotal, chiffrageTotals, suggestLot, compareWithOs, sanityChecks, osPriceRefs, calerSurObjectif, parseDpgfJson, posteNumero, lotNumero, observationsText } from '../chiffrage'

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

  it('totaux : travaux, aléas, honoraires, TTC, ratio TTC/m² MOE comprise (SHAB + ½ garage)', () => {
    expect(lotTotal(LOTS[0])).toBe(22242.5)
    const moe = { nom: 'HONORAIRES', honoraires: true, postes: [{ designation: 'Phase 1', quantite: 4, unite: 'mois', pu_ht: 2300 }] }
    expect(chiffrageTotals({ lots: [moe, ...LOTS], aleas_pct: 5, tva_pct: 20, surface_m2: 167.2, surface_annexes: 34.2 })).toEqual({
      ht: 38242.5, aleas: 1912.13, htAleas: 40154.63, honoraires: 9200, totalHt: 49354.63, tva: 9870.93, ttc: 59225.56,
      travauxTtc: 48185.56, surfaceRef: 184.3, ratioTtc: 321, ratioTravauxTtc: 261,
    })
    expect(chiffrageTotals({ lots: LOTS }).surfaceRef).toBeNull()
    expect([lotNumero(3), posteNumero(3, 4)]).toEqual(['04', '4.5'])
  })

  it('calage sur un objectif TTC : prix verrouillés et honoraires intacts', () => {
    const lots = normalizeLots([
      { nom: 'MOE', honoraires: true, postes: [{ designation: 'Phase', quantite: 1, unite: 'Ft', pu_ht: 10000 }] },
      { nom: 'GO', postes: [
        { designation: 'Plancher', quantite: 100, unite: 'm²', pu_ht: 110, verrou: true },
        { designation: 'Murs', quantite: 100, unite: 'm²', pu_ht: 80 },
        { designation: 'Petit', quantite: 10, unite: 'u', pu_ht: 5 },
      ] },
    ])
    // travaux 19 050 HT → objectif 21 000 TTC travaux seuls = 17 500 HT
    const r = calerSurObjectif({ lots, tva_pct: 20, cible_ttc: 21000 })
    expect(r.lots[0]).toBe(lots[0])
    expect(r.lots[1].postes.map(p => p.pu_ht)).toEqual([110, 65, 4])
    expect(r.atteint).toBe(21048)
    expect(r.ecart).toBe(48)
    // objectif avec honoraires : (33 000 / 1,2) − 10 000 = 17 500 HT de travaux
    expect(calerSurObjectif({ lots, tva_pct: 20, cible_ttc: 33000, avecHonoraires: true }).lots[1].postes[1].pu_ht).toBe(65)
    expect(calerSurObjectif({ lots, tva_pct: 20, cible_ttc: 12000 }).error).toMatch(/inatteignable/)
    expect(calerSurObjectif({ lots: [lots[0]], cible_ttc: 1000 }).error).toMatch(/Aucun prix modifiable/)
  })

  it('import d’un DPGF JSON : lots, honoraires reconnus, surfaces et observations', () => {
    const r = parseDpgfJson(JSON.stringify({ x: { dossier: { surfaces: { shab_total_m2: 100, garage_m2: 20 }, dpgf: {
      reference: 'DPGF-1', observations: ['A', 'B'],
      lots: [{ intitule: "Honoraires maîtrise d'œuvre", postes: [{ designation: 'Mission', unite: 'Ft', quantite: 1, pu_ht: 0 }] },
        { intitule: 'PEINTURE', postes: [{ designation: 'Murs', unite: 'm²', quantite: 400, pu_ht: 12 }] }],
    } } } }))
    expect(r.lots.map(l => !!l.honoraires)).toEqual([true, false])
    expect(r.lots[1].postes[0]).toMatchObject({ designation: 'Murs', quantite: 400, unite: 'm²', pu_ht: 12 })
    expect(r).toMatchObject({ surface_m2: 100, surface_annexes: 20, reference: 'DPGF-1', observations: 'A\nB' })
    expect(parseDpgfJson('Lot 1 maçonnerie 12 000 €')).toBeNull()
    expect(parseDpgfJson('{"a":1}')).toBeNull()
    expect(observationsText({ hypotheses: ['Sol porteur'], non_compris: ['piscine', 'clôtures'] })).toBe('Sol porteur\nNon compris : piscine, clôtures.')
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

  it('bon sens : prix manquants, doublons, coût au m² des travaux', () => {
    const lots = normalizeLots([
      { nom: 'A', postes: [{ designation: 'X', quantite: 1, pu_ht: 0 }, { designation: 'Y', quantite: 0, pu_ht: 10 }, { designation: 'Y', quantite: 1, pu_ht: 10 }] },
    ])
    const w = sanityChecks({ lots, surface_m2: 100 })
    expect(w).toEqual([
      'Lot « A » : 1 poste sans prix unitaire.',
      'Lot « A » : 1 poste sans quantité.',
      'Lot « A » : poste en double « Y ».',
      expect.stringMatching(/bas pour une construction neuve/),
    ])
    expect(sanityChecks({ lots: LOTS, surface_m2: 8, surface_annexes: 4 })).toEqual([expect.stringMatching(/élevé pour une maison individuelle/)])
  })

  it('prix de référence tirés des OS (dédoublonnés, récents d’abord)', () => {
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
