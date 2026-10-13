import {
  sameEntreprise, openActionsFor, parseReponse, reponseText, isRecentReponse, applyReponse,
  dueEcheances, emailFor, echeanceMailText, actionsUrl, withoutLinkParagraph,
} from '../crReponse'

const tasks = [
  { id: 't1', chantier_id: 'ch', titre: 'Reprendre l’enduit', entreprise: 'Leroy Plâtrerie', statut: 'En cours', num_point: 4, echeance: '2026-10-15', nb_rappels: 1 },
  { id: 't2', chantier_id: 'ch', titre: 'Évacuer les gravats', entreprise: 'leroy platrerie', statut: 'Planifié', num_point: 2, echeance: '2026-10-14' },
  { id: 't3', chantier_id: 'ch', titre: 'Soldé', entreprise: 'Leroy Plâtrerie', statut: 'Terminé', num_point: 1 },
  { id: 't4', chantier_id: 'ch', titre: 'Autre', entreprise: 'Martin Élec', statut: 'En cours', echeance: '2026-10-14' },
]

describe('réponses des entreprises', () => {
  it('reconnaît l’entreprise et ne montre que ses actions ouvertes', () => {
    expect(sameEntreprise('Leroy Plâtrerie', 'LEROY PLATRERIE')).toBe(true)
    expect(sameEntreprise('Leroy', 'Leroy Plâtrerie')).toBe(true)
    expect(sameEntreprise('Le', 'Leroy')).toBe(false)
    expect(openActionsFor(tasks, 'Leroy Plâtrerie').map(a => a.id)).toEqual(['t2', 't1'])
  })
  it('valide la réponse', () => {
    const today = '2026-10-13'
    expect(parseReponse({ type: 'fait' }, today)).toEqual({ type: 'fait', date: null, commentaire: '' })
    expect(parseReponse({ type: 'delai' }, today).error).toBe('Indiquez la nouvelle date.')
    expect(parseReponse({ type: 'delai', date: '2026-10-13' }, today).error).toMatch(/après aujourd’hui/)
    expect(parseReponse({ type: 'delai', date: '2026-10-20', commentaire: ' Livraison ' }, today)).toEqual({ type: 'delai', date: '2026-10-20', commentaire: 'Livraison' })
    expect(parseReponse({ type: 'desaccord', commentaire: 'non' }, today).error).toMatch(/Expliquez/)
    expect(parseReponse({ type: 'x' }, today).error).toBe('Choisissez une réponse.')
  })
  it('texte, réponse récente et pré-remplissage du CR suivant', () => {
    expect(reponseText({ type: 'delai', date: '2026-10-20', commentaire: 'Livraison' })).toBe('Plus de temps demandé : nouvelle date le 20/10/2026 — « Livraison »')
    const fait = { type: 'fait', photo: 'chantier/ch/p.jpg', le: '2026-10-10T08:00:00Z' }
    expect(isRecentReponse(fait, '2026-10-06')).toBe(true)
    expect(isRecentReponse(fait, '2026-10-10')).toBe(false)
    const row = { suivi: 'relance', vu: false, photos: [], reponse: fait }
    expect(applyReponse(row, '2026-10-06')).toMatchObject({ suivi: 'fait', vu: true, reponseRecente: true, photos: [{ path: 'chantier/ch/p.jpg' }] })
    expect(applyReponse(row, '2026-10-11')).toBe(row)
    expect(applyReponse({ ...row, reponse: { type: 'delai', date: '2026-10-25', le: '2026-10-10' } }, null)).toMatchObject({ suivi: 'en_cours', echeance: '2026-10-25' })
    expect(applyReponse({ ...row, reponse: { type: 'desaccord', commentaire: 'Pas notre lot', le: '2026-10-10' } }, null)).toMatchObject({ suivi: 'relance', vu: false, reponseRecente: true })
  })
})

describe('rappel avant échéance', () => {
  it('échéance dans 2 jours (4 le vendredi), une seule fois par échéance', () => {
    const list = [
      ...tasks,
      { id: 't5', chantier_id: 'ch', titre: 'Déjà rappelé', entreprise: 'X', statut: 'En cours', echeance: '2026-10-14', rappel_echeance: '2026-10-14' },
      { id: 't6', chantier_id: 'ch', titre: 'Reporté', entreprise: 'X', statut: 'En cours', echeance: '2026-10-15', rappel_echeance: '2026-10-08' },
      { id: 't7', chantier_id: 'fermé', titre: 'Chantier fini', entreprise: 'X', statut: 'En cours', echeance: '2026-10-14' },
      { id: 't8', chantier_id: 'ch', titre: 'Lundi', entreprise: 'X', statut: 'En cours', echeance: '2026-10-19' },
    ]
    const ids = (o) => dueEcheances(list, { today: '2026-10-13', closedChantiers: new Set(['fermé']), ...o }).map(t => t.id)
    expect(ids({ weekday: 2 })).toEqual(['t1', 't2', 't4', 't6'])
    expect(dueEcheances(list, { today: '2026-10-16', weekday: 5 }).map(t => t.id)).toEqual(['t8'])
  })
  it('adresse : intervenant du dernier CR, sinon contact', () => {
    expect(emailFor('Leroy Plâtrerie', { intervenants: [{ nom: 'Paul', societe: 'Leroy Plâtrerie', email: 'paul@leroy.fr' }] })).toEqual({ email: 'paul@leroy.fr', nom: 'Paul' })
    expect(emailFor('Martin Élec', { contacts: [{ nom: 'Martin', societe: 'Martin Élec', email: 'a@m.fr', email_travaux: 'chantier@m.fr' }] })).toEqual({ email: 'chantier@m.fr', nom: 'Martin' })
    expect(emailFor('Inconnu', {})).toBeNull()
  })
  it('mail : actions, lien ; le lien est retiré de la version HTML', () => {
    const link = actionsUrl('https://app.test/', 'a'.repeat(64))
    expect(link).toBe(`https://app.test/actions/${'a'.repeat(64)}`)
    const text = echeanceMailText({ nom: 'Paul', chantier: 'Villa Dupont', actions: [tasks[0]], link, company: { nom: 'SARL ID MAÎTRISE' } })
    expect(text).toContain('cette action est attendue sur le chantier Villa Dupont')
    expect(text).toContain('  • n°4 Reprendre l’enduit — pour le 15/10/2026')
    expect(text).toContain(link)
    expect(withoutLinkParagraph(text)).not.toContain(link)
    expect(withoutLinkParagraph(text)).toContain('Cordialement')
  })
})
