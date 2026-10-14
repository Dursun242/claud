import { cleanEmail, namesFor, inviteMailText } from '../clientInvite'

describe('invitation d’un client par son adresse', () => {
  it('adresse nettoyée ou refusée', () => {
    expect(cleanEmail('  Jean.Dupont@Gmail.com ')).toBe('jean.dupont@gmail.com')
    expect(cleanEmail('pas une adresse')).toBe('')
  })
  it('prénom et nom d’après le client, sinon l’adresse', () => {
    expect(namesFor('M. Jean Dupont', 'x@gmail.com')).toEqual({ prenom: 'Jean', nom: 'Dupont' })
    expect(namesFor('Havre De Savoir')).toEqual({ prenom: 'Havre', nom: 'De Savoir' })
    expect(namesFor('', 'marie.martin@gmail.com')).toEqual({ prenom: 'Marie martin', nom: '' })
  })
  it('mail d’invitation', () => {
    const t = inviteMailText({ client: 'Havre De Savoir', chantier: 'Mosquée', email: 'h@gmail.com', url: 'https://app.test', company: { nom: 'SARL ID MAÎTRISE' } })
    expect(t).toContain('Bonjour Havre De Savoir,')
    expect(t).toContain('chantier « Mosquée »')
    expect(t).toContain('compte Google (h@gmail.com) :\nhttps://app.test')
  })
})
