import { tvaIntra, nafLabel, normalizeEntreprise, splitSearchResults } from '../entreprises'

// Extrait d'une réponse de recherche-entreprises.api.gouv.fr/search
const ACME = {
  siren: '552100554',
  nom_complet: 'ACME BATIMENT (ACME)',
  nom_raison_sociale: 'ACME BATIMENT',
  activite_principale: '43.99C',
  etat_administratif: 'A',
  siege: {
    siret: '55210055400013', activite_principale: '43.99C',
    adresse: '12 RUE DE PARIS 76600 LE HAVRE', code_postal: '76600', libelle_commune: 'LE HAVRE',
    numero_voie: '12', type_voie: 'RUE', libelle_voie: 'DE PARIS',
  },
  matching_etablissements: [{
    siret: '55210055400021', activite_principale: '43.99C',
    adresse: 'ZA DU BOIS 2 CHEMIN VERT 76290 MONTIVILLIERS', code_postal: '76290', libelle_commune: 'MONTIVILLIERS',
  }],
  dirigeants: [
    { nom: 'MARTIN', prenoms: 'Julien Pierre', qualite: 'Gérant', type_dirigeant: 'personne physique' },
    { siren: '123456789', denomination: 'HOLDING X', qualite: 'Associé', type_dirigeant: 'personne morale' },
  ],
}

describe('annuaire des entreprises', () => {
  it('TVA intracommunautaire calculée depuis le SIREN', () => {
    expect(tvaIntra('552100554')).toBe('FR96552100554')
    expect(tvaIntra('404 833 048')).toBe('FR83404833048')
    expect(tvaIntra('123')).toBe('')
  })

  it('libellé NAF des activités du bâtiment, sinon le code', () => {
    expect(nafLabel('43.22A')).toContain('plomberie')
    expect(nafLabel('62.01Z')).toBe('NAF 62.01Z')
    expect(nafLabel('')).toBe('')
  })

  it('entreprise : siège par défaut, établissement recherché par SIRET', () => {
    const e = normalizeEntreprise(ACME)
    expect(e).toMatchObject({
      siren: '552100554', siret: '55210055400013', denomination: 'ACME BATIMENT',
      num_tva_intracommunautaire: 'FR96552100554',
      libelle_activite_principale: 'Travaux de maçonnerie générale et gros œuvre de bâtiment',
      siege: { adresse_ligne_1: '12 RUE DE PARIS', code_postal: '76600', ville: 'LE HAVRE' },
      representants: [{ prenom: 'Julien', nom: 'MARTIN', qualite: 'Gérant' }],
      active: true,
    })
    const etab = normalizeEntreprise(ACME, '55210055400021')
    expect(etab.siret).toBe('55210055400021')
    expect(etab.siege).toMatchObject({ adresse_ligne_1: 'ZA DU BOIS 2 CHEMIN VERT', ville: 'MONTIVILLIERS' })
    expect(normalizeEntreprise(null)).toBeNull()
  })

  it('recherche : par nom d’entreprise → entreprises ; par nom de dirigeant → dirigeants', () => {
    const byCompany = splitSearchResults([ACME], 'acme bâtiment')
    expect(byCompany.resultats).toHaveLength(1)
    expect(byCompany.dirigeants).toHaveLength(0)

    const byPerson = splitSearchResults([ACME], 'Julien Martin')
    expect(byPerson.resultats).toHaveLength(0)
    expect(byPerson.dirigeants).toEqual([
      expect.objectContaining({ prenom: 'Julien', nom: 'MARTIN', qualite: 'Gérant', entreprises: [expect.objectContaining({ denomination: 'ACME BATIMENT' })] }),
    ])
  })
})
