import {
  computeDevisTotals, ligneTotal, nextDevisNumero, devisFromOpportunite, duplicateDevis,
  validateDevis, normalizeLignes, isDevisStale, isDevisExpired, devisMailto, addDaysISO,
} from '../devis'

describe('ligneTotal / computeDevisTotals', () => {
  it('calcule le HT d’une ligne et ignore les titres', () => {
    expect(ligneTotal({ quantite: '2,5', prix_unitaire: '100' })).toBe(250)
    expect(ligneTotal({ type: 'titre', designation: 'Phase 1' })).toBe(0)
  })

  it('ventile la TVA par taux', () => {
    const t = computeDevisTotals([
      { type: 'titre', designation: 'Études' },
      { quantite: 1, prix_unitaire: 1000, tva_taux: 20 },
      { quantite: 2, prix_unitaire: 500, tva_taux: 10 },
    ])
    expect(t.ht).toBe(2000)
    expect(t.tvaParTaux).toEqual([
      { taux: 20, base: 1000, montant: 200 },
      { taux: 10, base: 1000, montant: 100 },
    ])
    expect(t.tva).toBe(300)
    expect(t.ttc).toBe(2300)
    expect(t.acompte).toBe(0)
  })

  it('applique la remise avant TVA puis calcule l’acompte sur le TTC', () => {
    const t = computeDevisTotals(
      [{ quantite: 1, prix_unitaire: 1000, tva_taux: 20 }],
      { remise_pct: '10', acompte_pct: 30 },
    )
    expect(t.htBrut).toBe(1000)
    expect(t.remise).toBe(100)
    expect(t.ht).toBe(900)
    expect(t.tva).toBe(180)
    expect(t.ttc).toBe(1080)
    expect(t.acompte).toBe(324)
  })

  it('arrondit au centime', () => {
    const t = computeDevisTotals([{ quantite: 3, prix_unitaire: 33.333, tva_taux: 5.5 }])
    expect(t.ht).toBe(100)
    expect(t.tva).toBe(5.5)
  })
})

describe('nextDevisNumero', () => {
  it('incrémente dans l’année et ignore les autres années', () => {
    const existing = [{ numero: 'DEV-2026-007' }, { numero: 'DEV-2026-002' }, { numero: 'DEV-2025-050' }, { numero: 'libre' }]
    expect(nextDevisNumero(existing, new Date('2026-05-01'))).toBe('DEV-2026-008')
    expect(nextDevisNumero(existing, new Date('2027-01-02'))).toBe('DEV-2027-001')
    expect(nextDevisNumero([], new Date('2026-05-01'))).toBe('DEV-2026-001')
  })
})

describe('devisFromOpportunite', () => {
  it('pré-remplit objet, validité à 30 j, ligne au forfait et TVA 10 % en rénovation', () => {
    const d = devisFromOpportunite(
      { id: 'o1', titre: 'Escalier extérieur', montant_estime: 8000, type_projet: 'Rénovation' },
      [{ numero: 'DEV-2026-003' }], new Date('2026-09-24T10:00:00'),
    )
    expect(d).toMatchObject({
      opportunite_id: 'o1', numero: 'DEV-2026-004', statut: 'Brouillon', objet: 'Escalier extérieur',
      date_emission: '2026-09-24', date_validite: '2026-10-24',
    })
    expect(d.lignes).toEqual([{ type: 'ligne', designation: 'Escalier extérieur', unite: 'forfait', quantite: '1', prix_unitaire: '8000', tva_taux: '10' }])
  })

  it('ligne vide et TVA 20 % sans montant ni rénovation', () => {
    const d = devisFromOpportunite({ id: 'o2', titre: 'Neuf', type_projet: 'Construction neuve' }, [], new Date('2026-01-10T10:00:00'))
    expect(d.lignes[0]).toMatchObject({ designation: '', prix_unitaire: '', tva_taux: '20' })
  })
})

describe('duplicateDevis', () => {
  it('crée une nouvelle version en brouillon sans id ni dates d’envoi', () => {
    const src = { id: 'd1', numero: 'DEV-2026-001', statut: 'Refusé', date_envoi: '2026-09-01', date_reponse: '2026-09-10',
      opportunite_id: 'o1', lignes: [{ type: 'ligne', designation: 'A', quantite: 1, prix_unitaire: 10, tva_taux: 20 }] }
    const d = duplicateDevis(src, [src], new Date('2026-09-24T10:00:00'))
    expect(d.id).toBeUndefined()
    expect(d.date_envoi).toBeUndefined()
    expect(d).toMatchObject({ numero: 'DEV-2026-002', statut: 'Brouillon', opportunite_id: 'o1', date_emission: '2026-09-24' })
    expect(d.lignes).not.toBe(src.lignes)
    expect(d.lignes[0]).not.toBe(src.lignes[0])
  })
})

describe('validateDevis', () => {
  const ok = { numero: 'DEV-2026-001', statut: 'Brouillon', lignes: [{ designation: 'Mission', quantite: '1', prix_unitaire: '100' }] }
  it('accepte un devis valide', () => expect(validateDevis(ok)).toBe(''))
  it('exige au moins une ligne', () => {
    expect(validateDevis({ ...ok, lignes: [{ type: 'titre', designation: 'X' }] })).toMatch(/au moins une ligne/)
  })
  it('exige désignation et quantité positive', () => {
    expect(validateDevis({ ...ok, lignes: [{ designation: ' ', quantite: 1 }] })).toMatch(/désignation/)
    expect(validateDevis({ ...ok, lignes: [{ designation: 'A', quantite: 0 }] })).toMatch(/quantité/)
  })
  it('borne remise et acompte, vérifie les dates', () => {
    expect(validateDevis({ ...ok, remise_pct: 120 })).toMatch(/remise/)
    expect(validateDevis({ ...ok, acompte_pct: -1 })).toMatch(/acompte/)
    expect(validateDevis({ ...ok, date_emission: '2026-09-24', date_validite: '2026-09-01' })).toMatch(/validité/)
  })
})

describe('normalizeLignes', () => {
  it('convertit en nombres et retire les titres vides', () => {
    expect(normalizeLignes([
      { type: 'titre', designation: '  ' },
      { type: 'titre', designation: ' Lot 1 ' },
      { designation: ' Dalle ', unite: 'm²', quantite: '12,5', prix_unitaire: '80', tva_taux: '10' },
    ])).toEqual([
      { type: 'titre', designation: 'Lot 1' },
      { type: 'ligne', designation: 'Dalle', unite: 'm²', quantite: 12.5, prix_unitaire: 80, tva_taux: 10 },
    ])
  })
})

describe('isDevisStale / isDevisExpired', () => {
  const today = new Date('2026-09-24T10:00:00')
  it('signale un devis envoyé depuis 7 jours sans réponse', () => {
    expect(isDevisStale({ statut: 'Envoyé', date_envoi: '2026-09-17' }, today)).toBe(true)
    expect(isDevisStale({ statut: 'Envoyé', date_envoi: '2026-09-20' }, today)).toBe(false)
    expect(isDevisStale({ statut: 'Accepté', date_envoi: '2026-01-01' }, today)).toBe(false)
  })
  it('signale un devis expiré tant qu’il n’est pas accepté / refusé', () => {
    expect(isDevisExpired({ statut: 'Envoyé', date_validite: '2026-09-23' }, today)).toBe(true)
    expect(isDevisExpired({ statut: 'Accepté', date_validite: '2026-09-23' }, today)).toBe(false)
    expect(isDevisExpired({ statut: 'Envoyé', date_validite: '2026-09-24' }, today)).toBe(false)
  })
})

describe('devisMailto / addDaysISO', () => {
  it('construit un mailto avec destinataire, objet et montants', () => {
    const url = devisMailto(
      { numero: 'DEV-2026-001', objet: 'Escalier', date_validite: '2026-10-24',
        lignes: [{ quantite: 1, prix_unitaire: 1000, tva_taux: 20 }] },
      { nom: 'Cousin', email: 'cousin@example.com' },
      { nom: 'SARL ID MAÎTRISE', gerant: 'Dursun' },
    )
    expect(url.startsWith('mailto:cousin%40example.com?subject=')).toBe(true)
    const body = decodeURIComponent(url.split('body=')[1])
    expect(decodeURIComponent(url.split('subject=')[1].split('&')[0])).toBe('Devis DEV-2026-001 — Escalier')
    expect(body).toMatch(/^Bonjour Cousin,/)
    expect(body).toMatch(/1\s000,00 € HT \(1\s200,00 € TTC\)/)
    expect(body).toMatch(/jusqu'au 24\/10\/2026/)
    expect(body).not.toMatch(/\n\n\n/)
  })
  it('addDaysISO franchit les fins de mois', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
  })
})
