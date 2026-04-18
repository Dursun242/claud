import {
  validateSiret,
  validatePhoneFR,
  validateEmail,
  validateIban,
  validateCodePostalFR,
  validateTvaIntra,
} from '../validators'

describe('validateSiret', () => {
  it('accepte une entrée vide (champ optionnel)', () => {
    expect(validateSiret('').valid).toBe(true)
    expect(validateSiret(null).valid).toBe(true)
    expect(validateSiret(undefined).valid).toBe(true)
  })

  it('rejette un SIRET trop court ou trop long', () => {
    expect(validateSiret('123').valid).toBe(false)
    expect(validateSiret('123456789012345').valid).toBe(false)
  })

  it('rejette un SIRET contenant des lettres', () => {
    expect(validateSiret('12345678901234A').valid).toBe(false)
  })

  it('accepte un SIRET dont la clé Luhn est correcte', () => {
    // SIREN 443061841 + établissement 00039 → clé Luhn OK
    expect(validateSiret('44306184100039').valid).toBe(true)
  })

  it('accepte les espaces dans la saisie', () => {
    expect(validateSiret('443 061 841 00039').valid).toBe(true)
  })

  it('rejette une clé de contrôle Luhn invalide', () => {
    // Même SIREN mais dernière digit fausse → rejeté
    expect(validateSiret('44306184100034').valid).toBe(false)
  })

  it('accepte les SIRET de La Poste (exception INSEE)', () => {
    expect(validateSiret('35600000000000').valid).toBe(true)
  })
})

describe('validatePhoneFR', () => {
  it('accepte vide', () => {
    expect(validatePhoneFR('').valid).toBe(true)
  })

  it('accepte un mobile français standard', () => {
    expect(validatePhoneFR('06 12 34 56 78').valid).toBe(true)
    expect(validatePhoneFR('0612345678').valid).toBe(true)
    expect(validatePhoneFR('02 35 42 15 89').valid).toBe(true)
  })

  it('accepte le format international +33', () => {
    expect(validatePhoneFR('+33 6 12 34 56 78').valid).toBe(true)
    expect(validatePhoneFR('+33612345678').valid).toBe(true)
  })

  it('rejette un numéro français qui commence par 0 puis 0', () => {
    expect(validatePhoneFR('0012345678').valid).toBe(false)
  })

  it('accepte un international hors FR (on ne bloque pas)', () => {
    expect(validatePhoneFR('+442071838750').valid).toBe(true)
  })

  it('rejette des chiffres au milieu du texte', () => {
    expect(validatePhoneFR('abc').valid).toBe(false)
  })
})

describe('validateEmail', () => {
  it('accepte vide', () => {
    expect(validateEmail('').valid).toBe(true)
  })

  it('accepte un email classique', () => {
    expect(validateEmail('a@b.fr').valid).toBe(true)
    expect(validateEmail('contact@id-maitrise.com').valid).toBe(true)
  })

  it('rejette sans @', () => {
    expect(validateEmail('plainaddress').valid).toBe(false)
  })

  it('rejette sans domaine', () => {
    expect(validateEmail('a@b').valid).toBe(false)
  })

  it('rejette avec espace interne', () => {
    expect(validateEmail('a b@c.fr').valid).toBe(false)
  })
})

describe('validateIban', () => {
  it('accepte vide', () => {
    expect(validateIban('').valid).toBe(true)
  })

  it('accepte un IBAN FR valide (MOD-97)', () => {
    // IBAN de test connu — clé correcte
    expect(validateIban('FR1420041010050500013M02606').valid).toBe(true)
  })

  it('ignore la casse et les espaces', () => {
    expect(validateIban('fr14 2004 1010 0505 0001 3M02 606').valid).toBe(true)
  })

  it('rejette un IBAN avec mauvaise clé', () => {
    expect(validateIban('FR9999999999999999999999999').valid).toBe(false)
  })

  it('rejette un format non-IBAN', () => {
    expect(validateIban('12345678').valid).toBe(false)
  })
})

describe('validateCodePostalFR', () => {
  it('accepte vide', () => {
    expect(validateCodePostalFR('').valid).toBe(true)
  })

  it('accepte 5 chiffres', () => {
    expect(validateCodePostalFR('76000').valid).toBe(true)
    expect(validateCodePostalFR('75015').valid).toBe(true)
  })

  it('rejette moins de 5 chiffres', () => {
    expect(validateCodePostalFR('7600').valid).toBe(false)
  })

  it('rejette avec lettres', () => {
    expect(validateCodePostalFR('7600X').valid).toBe(false)
  })
})

describe('validateTvaIntra', () => {
  it('accepte vide', () => {
    expect(validateTvaIntra('').valid).toBe(true)
  })

  it('accepte FR + 11 chiffres', () => {
    expect(validateTvaIntra('FR12345678901').valid).toBe(true)
  })

  it('ignore espaces et casse', () => {
    expect(validateTvaIntra('fr 123 456 789 01').valid).toBe(true)
  })

  it('rejette sans code pays', () => {
    expect(validateTvaIntra('12345678901').valid).toBe(false)
  })
})
