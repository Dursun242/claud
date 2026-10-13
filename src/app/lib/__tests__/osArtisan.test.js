import { findArtisanContact, normName } from '../osArtisan'

const contacts = [
  { id: 'c1', nom: 'Jean Costa', societe: 'Costa Plomberie', email: 'costa@ex.fr', siret: '123 456 789 00012' },
  { id: 'c2', nom: 'Électricité Martin', email: 'martin@ex.fr', email_travaux: 'chantier@martin.fr' },
  { id: 'c3', nom: 'Peinture Dupont' },
]

describe('findArtisanContact', () => {
  it('par SIRET, même avec des espaces différents', () => {
    expect(findArtisanContact({ artisan_nom: 'Autre nom', artisan_siret: '12345678900012' }, contacts).id).toBe('c1')
  })
  it('par email, administratif ou travaux', () => {
    expect(findArtisanContact({ artisan_nom: 'X', artisan_email: 'COSTA@ex.fr ' }, contacts).id).toBe('c1')
    expect(findArtisanContact({ artisan_nom: 'X', artisan_email: 'chantier@martin.fr' }, contacts).id).toBe('c2')
  })
  it('par nom ou raison sociale, sans majuscules ni accents', () => {
    expect(findArtisanContact({ artisan_nom: 'electricite  martin' }, contacts).id).toBe('c2')
    expect(findArtisanContact({ artisan_nom: 'COSTA PLOMBERIE' }, contacts).id).toBe('c1')
  })
  it('inconnu : null', () => {
    expect(findArtisanContact({ artisan_nom: 'Maçonnerie Leroy' }, contacts)).toBeNull()
    expect(findArtisanContact({}, contacts)).toBeNull()
  })
  it('normName', () => {
    expect(normName('  Électricité-Martin ')).toBe('electricite martin')
  })
})
