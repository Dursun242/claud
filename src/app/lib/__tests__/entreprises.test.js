import { tvaFromSiren, nafLabel, normalizeEntreprise, pickEtablissement, extractDirigeants } from '../entreprises'

const raw = {
  siren: '921536181', nom_complet: 'ID MAITRISE', nom_raison_sociale: 'ID MAITRISE',
  activite_principale: '71.12B', nature_juridique: '5499', date_creation: '2023-01-10',
  etat_administratif: 'A', nombre_etablissements: 2,
  siege: { siret: '92153618100024', numero_voie: '9', type_voie: 'RUE', libelle_voie: 'HENRY GENESTAL', code_postal: '76600', libelle_commune: 'LE HAVRE' },
  matching_etablissements: [
    { siret: '92153618100024', numero_voie: '9', type_voie: 'RUE', libelle_voie: 'HENRY GENESTAL', code_postal: '76600', libelle_commune: 'LE HAVRE' },
    { siret: '92153618100032', adresse: '12 QUAI DE SOUTHAMPTON 76600 LE HAVRE', code_postal: '76600', libelle_commune: 'LE HAVRE' },
  ],
  dirigeants: [
    { nom: 'CAGLAYAN', prenoms: 'Dursun, Yusuf', qualite: 'Gérant', type_de_personne: 'personne physique' },
    { denomination: 'HOLDING X', siren: '111222333', qualite: 'Associé', type_de_personne: 'personne morale' },
  ],
}

describe('entreprises — normalisation', () => {
  it('tvaFromSiren applique la clé (12 + 3 × SIREN mod 97) mod 97', () => {
    // 921536181 mod 97 = 0 → clé 12
    expect(tvaFromSiren('921536181')).toBe('FR12921536181')
    expect(tvaFromSiren('12')).toBeNull()
  })

  it('nafLabel traduit les codes bâtiment connus, sinon renvoie le code', () => {
    expect(nafLabel('43.21A')).toMatch(/électrique/)
    expect(nafLabel('99.99Z')).toBe('99.99Z')
  })

  it('normalizeEntreprise produit la shape attendue par le formulaire contact', () => {
    const e = normalizeEntreprise(raw)
    expect(e).toMatchObject({
      siren: '921536181', siret: '92153618100024', denomination: 'ID MAITRISE',
      num_tva_intracommunautaire: 'FR12921536181', code_naf: '71.12B',
      libelle_activite_principale: 'Ingénierie, études techniques',
      siege: { adresse_ligne_1: '9 RUE HENRY GENESTAL', code_postal: '76600', ville: 'Le Havre' },
    })
    expect(e.representants[0]).toEqual({ prenom: 'Dursun', nom: 'CAGLAYAN', qualite: 'Gérant', personne_morale: false })
    expect(e.representants[1]).toMatchObject({ nom: 'HOLDING X', personne_morale: true })
    expect(e.etablissements).toHaveLength(2)
    expect(e.etablissements[1].adresse_ligne_1).toBe('12 QUAI DE SOUTHAMPTON')
  })

  it('pickEtablissement remonte l’adresse de l’établissement secondaire demandé', () => {
    const e = pickEtablissement(normalizeEntreprise(raw), '92153618100032')
    expect(e.siret).toBe('92153618100032')
    expect(e.siege.adresse_ligne_1).toBe('12 QUAI DE SOUTHAMPTON')
    expect(pickEtablissement(normalizeEntreprise(raw), '00000000000000').siret).toBe('92153618100024')
  })

  it('extractDirigeants retrouve les personnes physiques dont le nom matche la requête', () => {
    const list = [normalizeEntreprise(raw)]
    const d = extractDirigeants(list, 'yusuf caglayan')
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ nom: 'CAGLAYAN', prenom: 'Dursun', qualite: 'Gérant' })
    expect(d[0].entreprises[0].denomination).toBe('ID MAITRISE')
    expect(extractDirigeants(list, 'id maitrise')).toHaveLength(0)
    expect(extractDirigeants(list, 'ab')).toHaveLength(0)
  })
})
