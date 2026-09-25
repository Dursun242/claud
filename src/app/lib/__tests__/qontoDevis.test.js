import {
  toQontoQuote, qontoClientPayload, matchQontoClient,
  isNumberTaken, isUnitRejected, qontoErrorDetail, totalsMismatch, qontoFingerprint,
  isNumberRequired, isTinMissing, sirenFromContact, qontoQuoteToDevis,
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
    // « NOM Prénom » : le nom en majuscules est le nom de famille
    expect(qontoClientPayload({ nom: 'OZKAN Dursun' }))
      .toMatchObject({ kind: 'individual', first_name: 'Dursun', last_name: 'OZKAN' })
    expect(qontoClientPayload({ nom: 'Jean-Marc DE LA TOUR' }))
      .toMatchObject({ kind: 'individual', first_name: 'Jean-Marc', last_name: 'DE LA TOUR' })
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

describe('SIREN du client', () => {
  it('SIREN tiré du SIRET (ou SIREN) de la fiche, envoyé pour une société', () => {
    expect(sirenFromContact({ siret: '921 536 181 00024' })).toBe('921536181')
    expect(sirenFromContact({ siret: '921536181' })).toBe('921536181')
    expect(sirenFromContact({ siret: '12345' })).toBeNull()
    expect(qontoClientPayload({ societe: 'SCI Dupont', siret: '92153618100024' }).tax_identification_number).toBe('921536181')
    expect(qontoClientPayload({ societe: 'SCI Dupont' }).tax_identification_number).toBeUndefined()
  })

  it('reconnaît l’erreur tin_number sans la confondre avec le numéro du devis', () => {
    const tin = { errors: [{ source: { pointer: '/customer/tin_number' }, detail: '`tin_number` must have a value' }] }
    expect(isTinMissing(422, tin)).toBe(true)
    expect(isNumberRequired(422, { errors: [{ source: { pointer: '/customer/tin_number' }, detail: "can't be blank" }] })).toBe(false)
    expect(isNumberRequired(422, { errors: [{ source: { pointer: '/number' }, detail: "can't be blank" }] })).toBe(true)
  })
})

describe('qontoQuoteToDevis (import)', () => {
  it('convertit lignes, TVA (fraction ou %), remise, statut et totaux', () => {
    const d = qontoQuoteToDevis({
      number: 'D-2026-020', status: 'approved', header: 'Mission MOE', issue_date: '2026-09-01', expiry_date: '2026-10-01',
      approved_at: '2026-09-10T08:00:00Z', terms_and_conditions: 'CGV', footer: 'Merci',
      items: [
        { title: 'Études', description: 'Phase APS', quantity: '1', unit: 'forfait', unit_price: { value: '1000.00' }, vat_rate: '0.2' },
        { title: 'Suivi', quantity: '2', unit: null, unit_price: { value: '500.00' }, vat_rate: '20.0' },
      ],
      discount: { type: 'amount', value: '200', amount: { value: '200.00' } },
    })
    expect(d).toMatchObject({
      numero: 'D-2026-020', statut: 'Accepté', objet: 'Mission MOE', conditions: 'CGV', notes: 'Merci',
      date_emission: '2026-09-01', date_validite: '2026-10-01', date_reponse: '2026-09-10', remise_pct: 10,
      total_ht: 1800, total_tva: 360, total_ttc: 2160,
    })
    expect(d.lignes).toEqual([
      { type: 'ligne', designation: 'Études — Phase APS', unite: 'forfait', quantite: 1, prix_unitaire: 1000, tva_taux: 20 },
      { type: 'ligne', designation: 'Suivi', unite: 'u', quantite: 2, prix_unitaire: 500, tva_taux: 20 },
    ])
  })

  it('statut : en attente → Envoyé, annulé → Refusé ; TVA 5,5 %', () => {
    expect(qontoQuoteToDevis({ status: 'pending_approval', items: [] }).statut).toBe('Envoyé')
    expect(qontoQuoteToDevis({ status: 'canceled', items: [] }).statut).toBe('Refusé')
    expect(qontoQuoteToDevis({ items: [{ title: 'x', quantity: '1', unit_price: { value: '1' }, vat_rate: '0.055' }] }).lignes[0].tva_taux).toBe(5.5)
  })
})

