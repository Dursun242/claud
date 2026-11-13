import {
  tvaRate, lineHT, computeOsTotals, cleanPrestations,
  statutsPossibles, canChangeStatut, osLockReason, deleteBlockReason,
  validateOs, newOsDraft, draftFromOs, editablePrestations,
} from '../osRules'

const line = (o = {}) => ({ description: 'Pose', unite: 'u', quantite: '1', prix_unitaire: '100', tva_taux: '20', ...o })

describe('montants', () => {
  it('garde 0 % à 0 % et met 20 % seulement si le taux manque', () => {
    expect(tvaRate({ tva_taux: '0' })).toBe(0)
    expect(tvaRate({ tva_taux: 0 })).toBe(0)
    expect(tvaRate({ tva_taux: '5.5' })).toBe(5.5)
    expect(tvaRate({ tva_taux: '' })).toBe(20)
    expect(tvaRate({})).toBe(20)
    expect(tvaRate({ tva_taux: '10' }, true)).toBe(0)
  })

  it('calcule la ligne au centime, virgule acceptée', () => {
    expect(lineHT({ quantite: '3', prix_unitaire: '33,333' })).toBe(100)
    expect(lineHT({ quantite: 'abc', prix_unitaire: '10' })).toBe(0)
  })

  it('totalise par taux comme le PDF', () => {
    const t = computeOsTotals([
      line({ quantite: '1', prix_unitaire: '100', tva_taux: '20' }),
      line({ quantite: '2', prix_unitaire: '50', tva_taux: '10' }),
      line({ quantite: '1', prix_unitaire: '200', tva_taux: '0' }),
    ])
    expect(t).toEqual({ ht: 400, tva: 30, ttc: 430, parTaux: { 20: 20, 10: 10, 0: 0 } })
  })

  it('TVA non applicable : TTC = HT', () => {
    const t = computeOsTotals([line({ prix_unitaire: '250' })], true)
    expect(t.tva).toBe(0)
    expect(t.ttc).toBe(250)
  })

  it('enlève les lignes vides et force 0 % si TVA non applicable', () => {
    const out = cleanPrestations([line(), { description: '', quantite: '', prix_unitaire: '' }], true)
    expect(out).toHaveLength(1)
    expect(out[0].tva_taux).toBe('0')
  })
})

describe('cycle de vie', () => {
  it('propose le statut courant et les passages autorisés', () => {
    expect(statutsPossibles('Brouillon')).toEqual(['Brouillon', 'Émis', 'Annulé'])
    expect(statutsPossibles('Signé')).toEqual(['Signé', 'En cours', 'Annulé'])
    expect(statutsPossibles('Terminé')).toEqual(['En cours', 'Terminé'])
    expect(statutsPossibles(undefined)).toEqual(['Brouillon', 'Émis', 'Annulé'])
  })

  it('refuse les sauts de statut', () => {
    expect(canChangeStatut('Brouillon', 'Terminé')).toBe(false)
    expect(canChangeStatut('Signé', 'Brouillon')).toBe(false)
    expect(canChangeStatut('En cours', 'Terminé')).toBe(true)
    expect(canChangeStatut('Émis', 'Émis')).toBe(true)
  })

  it('fige un OS signé ou en signature, pas un brouillon', () => {
    expect(osLockReason({ id: 'a', statut: 'Brouillon' })).toBeNull()
    expect(osLockReason({ id: 'a', statut: 'Émis', statut_signature: 'Non envoyé' })).toBeNull()
    expect(osLockReason({ id: 'a', statut: 'En cours' })).toMatch(/figé/)
    expect(osLockReason({ id: 'a', statut: 'Émis', statut_signature: 'Signé' })).toMatch(/signé/)
    expect(osLockReason({ id: 'a', statut: 'Émis', statut_signature: 'Envoyé' })).toMatch(/Réinitialisez/)
    expect(osLockReason({ statut: 'Signé' })).toBeNull() // pas encore enregistré
  })

  it("ne laisse pas supprimer un OS signé ou en signature", () => {
    expect(deleteBlockReason({ numero: 'OS-1', statut: 'Signé' })).toMatch(/Annulé/)
    expect(deleteBlockReason({ numero: 'OS-1', statut: 'Émis', statut_signature: 'Partiellement signé' })).toMatch(/signature/)
    expect(deleteBlockReason({ numero: 'OS-1', statut: 'Brouillon' })).toBeNull()
    expect(deleteBlockReason({ numero: 'OS-1', statut: 'Annulé' })).toBeNull()
  })
})

describe('validateOs', () => {
  const form = (o = {}) => ({
    numero: 'OS-2026-003', chantier_id: 'c1', artisan_nom: 'Durand', statut: 'Brouillon',
    date_emission: '2026-11-13', ...o,
  })
  const allOs = [{ id: 'x', numero: 'OS-2026-001' }, { id: 'y', numero: 'OS-2026-002' }]

  it('accepte un OS complet', () => {
    expect(validateOs(form(), [line()], { allOs })).toBeNull()
  })

  it('exige numéro unique, chantier et entreprise', () => {
    expect(validateOs(form({ numero: '' }), [line()])).toMatch(/numéro/)
    expect(validateOs(form({ numero: 'os-2026-002 ' }), [line()], { allOs })).toMatch(/déjà pris/)
    expect(validateOs(form({ id: 'y', numero: 'OS-2026-002' }), [line()], { allOs })).toBeNull()
    expect(validateOs(form({ chantier_id: '' }), [line()])).toMatch(/chantier/)
    expect(validateOs(form({ artisan_nom: ' ' }), [line()])).toMatch(/entreprise/)
  })

  it('exige des lignes complètes et un montant', () => {
    expect(validateOs(form(), [])).toMatch(/au moins une prestation/)
    expect(validateOs(form(), [{ description: '', quantite: '', prix_unitaire: '' }])).toMatch(/au moins une prestation/)
    expect(validateOs(form(), [line({ description: '' })])).toMatch(/Ligne 1 : la description/)
    expect(validateOs(form(), [line(), line({ quantite: '0' })])).toMatch(/Ligne 2 : la quantité/)
    expect(validateOs(form(), [line({ prix_unitaire: '-5' })])).toMatch(/prix unitaire/)
    expect(validateOs(form(), [line({ prix_unitaire: '0' })])).toMatch(/montant HT/)
  })

  it('contrôle les dates', () => {
    expect(validateOs(form({ statut: 'Émis', date_emission: '' }), [line()], { previous: { statut: 'Brouillon' } }))
      .toMatch(/date d'émission/)
    expect(validateOs(form({ date_intervention: '2026-12-10', date_fin_prevue: '2026-12-01' }), [line()]))
      .toMatch(/fin prévue/)
  })

  it('refuse un saut de statut et ne recontrôle pas le contenu d’un OS figé', () => {
    expect(validateOs(form({ id: 'x', statut: 'Terminé' }), [line()], { previous: { id: 'x', statut: 'Brouillon' } }))
      .toMatch(/impossible/)
    const signe = { id: 'x', numero: 'OS-2026-003', statut: 'Signé', prestations: [] }
    expect(validateOs(form({ id: 'x', statut: 'En cours' }), [], { previous: signe })).toBeNull()
  })
})

describe('brouillons', () => {
  const now = new Date(2026, 10, 13, 10)
  const chantier = { id: 'c1', nom: 'Maison Martin', client: 'M. Martin' }

  it('prépare un OS vierge numéroté pour le chantier', () => {
    const d = newOsDraft({ chantier, allOs: [{ numero: 'OS-2026-007' }], now })
    expect(d).toMatchObject({
      numero: 'OS-2026-008', chantier_id: 'c1', client_nom: 'M. Martin',
      date_emission: '2026-11-13', statut: 'Brouillon', tva_non_applicable: false,
    })
  })

  it("reprend un OS sans sa signature, ses dates ni son statut", () => {
    const src = {
      id: 'x', numero: 'OS-2026-007', chantier_id: 'c1', statut: 'Signé', statut_signature: 'Signé',
      odoo_sign_id: 12, artisan_nom: 'Durand', artisan_email: 'd@ex.fr', lot: 'Gros œuvre',
      date_intervention: '2026-10-01', tva_non_applicable: true,
      prestations: [{ description: 'Dalle', unite: 'm²', quantite: 20, prix_unitaire: 45, tva_taux: 0 }],
    }
    const { form, prestations } = draftFromOs(src, { chantier, allOs: [src], now })
    expect(form.numero).toBe('OS-2026-008')
    expect(form.statut).toBe('Brouillon')
    expect(form.id).toBeUndefined()
    expect(form.odoo_sign_id).toBeUndefined()
    expect(form.date_intervention).toBe('')
    expect(form).toMatchObject({ artisan_nom: 'Durand', lot: 'Gros œuvre', tva_non_applicable: true })
    expect(prestations).toEqual([{ description: 'Dalle', unite: 'm²', quantite: '20', prix_unitaire: '45', tva_taux: '0' }])
  })

  it("un modèle posé sur un autre chantier prend le client de ce chantier", () => {
    const tpl = { chantier_id: 'autre', client_nom: 'Ancien client', lot: 'Lot 3', artisan_nom: 'Durand' }
    const { form } = draftFromOs(tpl, { chantier, allOs: [], now })
    expect(form).toMatchObject({ chantier_id: 'c1', client_nom: 'M. Martin', lot: '', artisan_nom: 'Durand' })
  })

  it('met les lignes existantes en texte pour le formulaire', () => {
    expect(editablePrestations({ prestations: [{ description: 'a', quantite: 2, prix_unitaire: 3, tva_taux: 0 }] }))
      .toEqual([{ description: 'a', unite: 'u', quantite: '2', prix_unitaire: '3', tva_taux: '0' }])
    expect(editablePrestations({})).toHaveLength(1)
  })
})
