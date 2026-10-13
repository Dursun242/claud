import { needsMiseEnDemeure, miseEnDemeureCandidates, pointsEnSouffrance, adresseOf, miseEnDemeureText, miseEnDemeureMail } from '../miseEnDemeure'

const rows = [
  { key: 'a', id: 'a', num: 4, titre: 'Reprendre l’enduit du séjour', entreprise: 'Leroy Plâtrerie', lot: 'Plâtrerie', suivi: 'relance', rappels: 3, echeance: '2026-09-25', origineNumero: 2 },
  { key: 'b', id: 'b', num: 6, titre: 'Évacuer les gravats', entreprise: 'leroy platrerie', lot: 'Plâtrerie', suivi: 'relance', rappels: 2, echeance: '2026-10-01' },
  { key: 'c', id: 'c', num: 7, titre: 'Nouveau', entreprise: 'Leroy Plâtrerie', suivi: 'en_cours', rappels: 0 },
  { key: 'd', id: 'd', num: 8, titre: 'Soldé', entreprise: 'Leroy Plâtrerie', suivi: 'fait', rappels: 4 },
  { key: 'e', id: 'e', num: 9, titre: 'Tableau', entreprise: 'Martin', suivi: 'relance', rappels: 2 },
]

describe('mise en demeure', () => {
  it('proposée à la 3e relance, avec les points relancés au moins deux fois', () => {
    expect(needsMiseEnDemeure(rows[0])).toBe(true)
    expect(needsMiseEnDemeure(rows[1])).toBe(false)
    expect(needsMiseEnDemeure(rows[3])).toBe(false)
    const c = miseEnDemeureCandidates(rows)
    expect(c).toHaveLength(1)
    expect(c[0].entreprise).toBe('Leroy Plâtrerie')
    expect(c[0].points.map(p => p.key)).toEqual(['a', 'b'])
    expect(pointsEnSouffrance(rows, 'Martin').map(p => p.key)).toEqual(['e'])
  })
  it('adresse de l’entreprise depuis ses contacts', () => {
    const contacts = [{ nom: 'Paul Leroy', societe: 'Leroy Plâtrerie', adresse: '3 rue des Lilas', code_postal: '76600', ville: 'Le Havre', email: 'p@l.fr' }]
    expect(adresseOf(contacts, 'leroy platrerie')).toEqual({ nom: 'Leroy Plâtrerie', attention: 'Paul Leroy', lignes: ['3 rue des Lilas', '76600 Le Havre'], email: 'p@l.fr' })
    expect(adresseOf([], 'X')).toEqual({ nom: 'X', lignes: [], email: '' })
  })
  it('texte du courrier', () => {
    const t = miseEnDemeureText({
      entreprise: 'Leroy Plâtrerie', chantier: { nom: 'Villa Dupont', adresse: '1 rue X, Le Havre', client: 'M. Dupont' },
      points: rows.slice(0, 2), delai: 8, date: '2026-10-13', company: { nom: 'SARL ID MAÎTRISE' },
    })
    expect(t.objet).toBe('Mise en demeure — chantier Villa Dupont')
    expect(t.date).toBe('13/10/2026')
    expect(t.paragraphes[1]).toBe('Dans le cadre du chantier Villa Dupont, 1 rue X, Le Havre, réalisé pour le compte de M. Dupont, votre entreprise Leroy Plâtrerie intervient au titre du lot Plâtrerie.')
    expect(t.points[0]).toBe('Point n°4 : Reprendre l’enduit du séjour, demandé au compte rendu n°2, attendu pour le 25/09/2026, relancé 3 fois.')
    expect(t.paragraphes).toContain('En conséquence, nous vous mettons en demeure de les exécuter dans un délai de 8 jours à compter de la réception du présent courrier.')
    expect(t.copie).toBe('Copie : M. Dupont, maître d’ouvrage')
    expect(miseEnDemeureMail({ text: t, company: { nom: 'SARL ID MAÎTRISE' } })).toContain('courrier de mise en demeure du 13/10/2026 (mise en demeure — chantier Villa Dupont)')
  })
})
