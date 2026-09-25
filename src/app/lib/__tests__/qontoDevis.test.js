import {
  toQontoQuote, qontoClientPayload, matchQontoClient,
  isNumberTaken, isUnitRejected, qontoErrorDetail, totalsMismatch, qontoFingerprint,
} from '../qontoDevis'

const devis = {
  numero: '26-050',
  objet: 'Escalier extérieur',
  date_emission: '2026-09-25',
  date_validite: '2026-10-25',
  remise_pct: 10,
  acompte_pct: 30,
  conditions: 'Paiement à 30 jours.',
  notes: '',
  lignes: [
    { type: 'titre', designation: 'Études' },
    { type: 'ligne', designation: 'Relevé et plans', unite: 'forfait', quantite: 1, prix_unitaire: 1000, tva_taux: 20 },
    { type: 'ligne', designation: 'Maçonnerie', unite: 'm²', quantite: 2.5, prix_unitaire: 80, tva_taux: 5.5 },
  ],
}

describe('toQontoQuote', () => {
  it('convertit lignes, TVA en fraction, remise en montant ; pas de numéro (Qonto numérote)', () => {
    const q = toQontoQuote(devis, { clientId: 'c1' })
    expect(q.number).toBeUndefined()
    expect(toQontoQuote(devis, { clientId: 'c1', number: '26-061' }).number).toBe('26-061')
    expect(q).toMatchObject({
      client_id: 'c1', issue_date: '2026-09-25', expiry_date: '2026-10-25',
      currency: 'EUR', header: 'Escalier extérieur', terms_and_conditions: 'Paiement à 30 jours.',
      discount: { type: 'amount', value: '120.00' },
    })
    expect(q.items).toEqual([
      { title: 'Relevé et plans', description: 'Études', quantity: '1', unit: 'forfait', unit_price: { value: '1000.00', currency: 'EUR' }, vat_rate: '0.2' },
      { title: 'Maçonnerie', description: 'Études', quantity: '2.5', unit: 'm²', unit_price: { value: '80.00', currency: 'EUR' }, vat_rate: '0.055' },
    ])
    expect(q.footer).toMatch(/Acompte de 30 %/)
  })

  it('sans unité sur demande, sans remise ni en-tête si absents', () => {
    const q = toQontoQuote({ ...devis, remise_pct: 0, objet: '' }, { clientId: 'c1', withUnits: false })
    expect(q.items[0].unit).toBeUndefined()
    expect(q.discount).toBeUndefined()
    expect(q.header).toBeUndefined()
  })

  it('tronque les désignations longues et garde le texte complet en description', () => {
    const long = 'x'.repeat(200)
    const q = toQontoQuote({ ...devis, lignes: [{ type: 'ligne', designation: long, quantite: 1, prix_unitaire: 1, tva_taux: 0 }] }, { clientId: 'c' })
    expect(q.items[0].title.length).toBe(120)
    expect(q.items[0].description).toBe(long)
    expect(q.items[0].vat_rate).toBe('0')
  })
})

describe('client Qonto', () => {
  it('société si raison sociale, particulier sinon', () => {
    expect(qontoClientPayload({ societe: 'SCI Dupont', nom: 'Jean Dupont', email: 'a@b.fr', tva_intra: 'FR 12 345678901', ville: 'Le Havre' }))
      .toMatchObject({ kind: 'company', name: 'SCI Dupont', email: 'a@b.fr', vat_number: 'FR12345678901', city: 'Le Havre', country_code: 'FR' })
    expect(qontoClientPayload({ nom: 'Jean de la Tour' }))
      .toMatchObject({ kind: 'individual', first_name: 'Jean', last_name: 'de la Tour' })
    expect(qontoClientPayload({ nom: 'Dupont' })).toMatchObject({ kind: 'company', name: 'Dupont' })
  })

  it('retrouve le client par email puis par nom (accents, ordre nom/prénom)', () => {
    const clients = [
      { id: '1', name: 'SCI Dupont' },
      { id: '2', first_name: 'Hélène', last_name: 'Martin' },
      { id: '3', name: 'Autre', email: 'x@y.fr' },
    ]
    expect(matchQontoClient(clients, { email: 'X@y.fr', nom: 'Zzz' }).id).toBe('3')
    expect(matchQontoClient(clients, { societe: 'sci dupont' }).id).toBe('1')
    expect(matchQontoClient(clients, { nom: 'Martin Helene' }).id).toBe('2')
    expect(matchQontoClient(clients, { nom: 'Inconnu' })).toBeNull()
  })
})

describe('erreurs et contrôles', () => {
  it('reconnaît un numéro déjà pris et une unité refusée', () => {
    const taken = { errors: [{ source: { pointer: '/number' }, detail: 'has already been taken' }] }
    expect(isNumberTaken(422, taken)).toBe(true)
    expect(isNumberTaken(500, taken)).toBe(false)
    expect(isUnitRejected(422, { errors: [{ source: { pointer: '/items/0/unit' }, detail: 'is invalid' }] })).toBe(true)
    expect(isUnitRejected(422, { errors: [{ source: { pointer: '/items/0/unit_price' }, detail: 'is invalid' }] })).toBe(false)
    expect(qontoErrorDetail(taken)).toBe('number : has already been taken')
  })

  it('signale un écart de total TTC', () => {
    // HT 1200 - 120 = 1080 ; TVA : 900 × 20 % + 180 × 5,5 % = 189,90 → 1269,90
    expect(totalsMismatch({ total_amount: { value: '1269.90' } }, devis)).toBeNull()
    expect(totalsMismatch({ total_amount: { value: '1500.00' } }, devis)).toEqual({ qonto: 1500, app: 1269.9 })
  })

  it('empreinte stable, sensible au contenu mais pas au statut ni au numéro', () => {
    expect(qontoFingerprint(devis)).toBe(qontoFingerprint({ ...devis, statut: 'Envoyé', numero: '26-099' }))
    expect(qontoFingerprint(devis)).not.toBe(qontoFingerprint({ ...devis, remise_pct: 5 }))
  })
})
