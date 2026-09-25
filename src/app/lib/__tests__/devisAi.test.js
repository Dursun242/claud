import {
  buildPriceHistory, suggestLignes, findInHistory, checkDevis, normalizeAiLignes,
  buildAiContext, parseEmails,
} from '../devisAi'

const devis = [
  { statut: 'Accepté', date_emission: '2026-03-01', lignes: [
    { type: 'titre', designation: 'Études' },
    { designation: 'Relevé de l’existant', unite: 'forfait', quantite: 1, prix_unitaire: 600, tva_taux: 20 },
    { designation: 'Suivi de chantier', unite: 'j', quantite: 3, prix_unitaire: 400, tva_taux: 20 },
  ] },
  { statut: 'Envoyé', date_emission: '2026-06-01', lignes: [
    { designation: 'Suivi de chantier', unite: 'j', quantite: 2, prix_unitaire: 450, tva_taux: 20 },
  ] },
  { statut: 'Refusé', date_emission: '2026-07-01', lignes: [
    { designation: 'Suivi de chantier', unite: 'j', quantite: 2, prix_unitaire: 999, tva_taux: 20 },
  ] },
]

describe('buildPriceHistory / suggestLignes', () => {
  const h = buildPriceHistory(devis)
  it('garde le prix le plus récent, ignore les devis refusés et les titres', () => {
    expect(h).toHaveLength(2)
    expect(h[0]).toMatchObject({ designation: 'Suivi de chantier', prix_unitaire: 450, count: 2 })
    expect(findInHistory('suivi  de CHANTIER', h)).toMatchObject({ prix_unitaire: 450 })
  })
  it('suggère par mots, sans accents ni casse', () => {
    expect(suggestLignes('releve exist', h).map(x => x.designation)).toEqual(['Relevé de l’existant'])
    expect(suggestLignes('s', h)).toEqual([])
    expect(suggestLignes('chantier suivi', h)).toHaveLength(1)
  })
})

describe('checkDevis', () => {
  const history = buildPriceHistory(devis)
  const base = {
    date_emission: '2026-09-24', date_validite: '2026-10-24', conditions: '',
    lignes: [{ designation: 'Suivi de chantier', unite: 'j', quantite: '2', prix_unitaire: '900', tva_taux: '10' }],
  }
  it('signale contact sans email, écart de prix, écart au montant estimé et TVA réduite', () => {
    const out = checkDevis(base, { opportunite: { montant_estime: 1000 }, contact: { nom: 'Cousin' }, history })
    const txt = out.map(o => o.text).join('\n')
    expect(txt).toMatch(/Cousin n’a pas d’email/)
    expect(txt).toMatch(/900 € au lieu de 450 €.*\+100 %/)
    expect(txt).toMatch(/supérieur de 80 %/)
    expect(txt).toMatch(/attestation/)
  })
  it('signale lignes sans prix et doublons, rien de plus pour un devis propre', () => {
    const out = checkDevis({ ...base, lignes: [
      { designation: 'A', quantite: '1', prix_unitaire: '', tva_taux: '20' },
      { designation: 'a', quantite: '1', prix_unitaire: '10', tva_taux: '20' },
    ] }, { contact: { nom: 'X', email: 'x@y.fr' } })
    expect(out.map(o => o.level)).toEqual(['error', 'warn'])
    expect(checkDevis({ ...base, lignes: [{ designation: 'B', quantite: '1', prix_unitaire: '10', tva_taux: '20' }] },
      { contact: { nom: 'X', email: 'x@y.fr' } })).toEqual([])
  })
})

describe('normalizeAiLignes', () => {
  it('convertit au format formulaire et borne les valeurs', () => {
    expect(normalizeAiLignes([
      { type: 'titre', designation: ' Travaux ' },
      { type: 'ligne', designation: 'Dalle', unite: 'm²', quantite: 12.5, prix_unitaire: 80.456, tva_taux: 10 },
      { type: 'ligne', designation: 'Bizarre', unite: 'lot', quantite: -2, prix_unitaire: -5, tva_taux: 7 },
      { type: 'ligne', designation: '   ' },
      null,
    ])).toEqual([
      { type: 'titre', designation: 'Travaux' },
      { type: 'ligne', designation: 'Dalle', unite: 'm²', quantite: '12.5', prix_unitaire: '80.46', tva_taux: '10' },
      { type: 'ligne', designation: 'Bizarre', unite: 'u', quantite: '1', prix_unitaire: '0', tva_taux: '20' },
    ])
    expect(normalizeAiLignes('x')).toEqual([])
  })
})

describe('buildAiContext / parseEmails', () => {
  it('construit un contexte compact', () => {
    const ctx = buildAiContext({
      opportunite: { titre: 'Escalier', type_projet: 'Rénovation', montant_estime: '8000', notes: 'n' },
      contact: { nom: 'Cousin', email: 'secret@x.fr' },
      interactions: [{ type: 'Appel', sujet: 's', contenu: 'c' }],
      history: buildPriceHistory(devis),
    })
    expect(ctx.affaire).toMatchObject({ titre: 'Escalier', montant_estime: 8000 })
    expect(ctx.client).toEqual({ nom: 'Cousin', societe: '', type: '' })
    expect(ctx.prix_habituels).toHaveLength(2)
  })
  it('découpe et valide les adresses', () => {
    expect(parseEmails('a@b.fr; c@d.com , bad')).toEqual({ list: ['a@b.fr', 'c@d.com', 'bad'], invalid: ['bad'] })
    expect(parseEmails('')).toEqual({ list: [], invalid: [] })
  })
})
