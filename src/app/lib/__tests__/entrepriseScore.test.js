import {
  actionValue, actionsCriterion, reunionsCriterion, documentsCriterion, avisCriterion,
  companyScore, scoreCompanies, resolveEntreprise, ranking, specialites, gradeOf, isScored,
} from '../entrepriseScore'
import { contactCompliance } from '../conformite'

const TODAY = '2026-10-16'

const kinds = (status) => ({ kinds: Object.fromEntries(['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => [k, { status }])) })

describe('actionValue', () => {
  it('faite sans relance : 1, chaque relance enlève un quart (0,25 au minimum)', () => {
    expect(actionValue({ statut: 'Terminé' }, TODAY)).toBe(1)
    expect(actionValue({ statut: 'Terminé', nb_rappels: 2 }, TODAY)).toBe(0.5)
    expect(actionValue({ statut: 'Terminé', nb_rappels: 9 }, TODAY)).toBe(0.25)
  })
  it('en retard : moitié au mieux, moins avec les relances', () => {
    expect(actionValue({ statut: 'En cours', echeance: '2026-10-01' }, TODAY)).toBe(0.5)
    expect(actionValue({ statut: 'En cours', echeance: '2026-10-01', nb_rappels: 1 }, TODAY)).toBeCloseTo(0.3)
    expect(actionValue({ statut: 'En cours', echeance: '2026-10-01', nb_rappels: 5 }, TODAY)).toBe(0)
  })
  it('mise en demeure : 0', () => {
    expect(actionValue({ statut: 'Terminé', mise_en_demeure_le: '2026-09-01' }, TODAY)).toBe(0)
  })
  it('ouverte, à temps, jamais relancée : ne compte pas encore', () => {
    expect(actionValue({ statut: 'En cours', echeance: '2026-11-01' }, TODAY)).toBeNull()
    expect(actionValue({ statut: 'En cours' }, TODAY)).toBeNull()
  })
})

describe('critères', () => {
  it('actions : moyenne et résumé', () => {
    const r = actionsCriterion([
      { statut: 'Terminé' },
      { statut: 'En cours', echeance: '2026-10-01', nb_rappels: 2 },
      { statut: 'En cours', echeance: '2026-12-01' },
    ], TODAY)
    expect(r.ratio).toBeCloseTo((1 + 0.1) / 2)
    expect(r.detail).toBe('1 faite sur 3 · 1 en retard · 2 relances')
  })
  it('actions : rien de mesurable → null', () => {
    expect(actionsCriterion([], TODAY)).toBeNull()
    expect(actionsCriterion([{ statut: 'En cours', echeance: '2027-01-01' }], TODAY)).toBeNull()
  })
  it('réunions : excusé = moitié, absent non convoqué ignoré', () => {
    const r = reunionsCriterion([
      { presence: 'Présent' }, { presence: 'Excusé' }, { presence: 'Absent' },
      { presence: 'Absent', convoque_prec: false },
    ])
    expect(r.ratio).toBeCloseTo(1.5 / 3)
    expect(r.detail).toBe('1/3 présent · 1 excusé · 1 absence')
    expect(reunionsCriterion([])).toBeNull()
  })
  it('documents : à jour = 1, à vérifier = ½, manquant = 0', () => {
    expect(documentsCriterion(kinds('ok')).ratio).toBe(1)
    expect(documentsCriterion(kinds('a_verifier')).ratio).toBe(0.5)
    expect(documentsCriterion(contactCompliance([], TODAY)).ratio).toBe(0)
    expect(documentsCriterion(null)).toBeNull()
  })
  it('avis : étoiles sur 5', () => {
    expect(avisCriterion(4).ratio).toBe(0.8)
    expect(avisCriterion(0)).toBeNull()
  })
})

describe('companyScore', () => {
  it('note ramenée sur les critères connus', () => {
    const s = companyScore({ compliance: kinds('ok'), note: 3, today: TODAY })
    // documents 25/25 + avis 15/25 sur 50 points connus
    expect(s.score).toBe(80)
    expect(s.known).toBe(50)
    expect(s.peuDeDonnees).toBe(false)
    expect(s.grade.grade).toBe('B')
  })
  it('aucune donnée : pas de note', () => {
    const s = companyScore({ today: TODAY })
    expect(s.score).toBeNull()
    expect(s.grade).toBeNull()
  })
  it('peu de données : un seul critère léger', () => {
    const s = companyScore({ presences: [{ presence: 'Présent' }], today: TODAY })
    expect(s.score).toBe(100)
    expect(s.peuDeDonnees).toBe(true)
  })
  it('entreprise fermée ou en procédure : note plafonnée', () => {
    expect(companyScore({ compliance: kinds('ok'), note: 5, legal: { statut: 'critique' }, today: TODAY }).score).toBe(15)
    expect(companyScore({ compliance: kinds('ok'), note: 5, legal: { statut: 'alerte' }, today: TODAY }).score).toBe(45)
    expect(companyScore({ legal: { statut: 'critique' }, today: TODAY }).score).toBe(15)
    expect(companyScore({ compliance: kinds('ok'), legal: { statut: 'ok' }, today: TODAY }).score).toBe(100)
  })
  it('historique : chantiers, OS et montant hors OS annulés', () => {
    const s = companyScore({
      os: [
        { chantier_id: 'a', montant_ht: 1000, date_emission: '2026-01-10' },
        { chantier_id: 'a', montant_ht: 500.4, date_intervention: '2026-03-01' },
        { chantier_id: 'b', montant_ht: 9999, statut: 'Annulé' },
      ],
      today: TODAY,
    })
    expect(s.historique).toEqual({ chantiers: 1, os: 2, montantHt: 1500, derniere: '2026-03-01' })
  })
})

describe('gradeOf', () => {
  it('seuils', () => {
    expect(gradeOf(85).grade).toBe('A')
    expect(gradeOf(84).grade).toBe('B')
    expect(gradeOf(55).grade).toBe('C')
    expect(gradeOf(40).grade).toBe('D')
    expect(gradeOf(0).grade).toBe('E')
    expect(gradeOf(null)).toBeNull()
  })
})

const contacts = [
  { id: 'c1', nom: 'Jean Costa', societe: 'Costa Plomberie', type: 'Artisan', specialite: 'Plomberie', siret: '12345678900012', note: 4 },
  { id: 'c2', nom: 'Électricité Martin', type: 'Sous-traitant', specialite: 'Électricité' },
  { id: 'c3', nom: 'Martin Peinture', type: 'Artisan', specialite: 'Peinture' },
  { id: 'c4', nom: 'Mme Client', type: 'Client' },
  { id: 'c5', nom: 'Ancien', type: 'Artisan', actif: false },
]

describe('resolveEntreprise', () => {
  it('nom ou raison sociale, sans accents ni majuscules', () => {
    expect(resolveEntreprise('costa plomberie', contacts).id).toBe('c1')
    expect(resolveEntreprise('ELECTRICITE MARTIN', contacts).id).toBe('c2')
  })
  it('par SIRET (SIREN)', () => {
    expect(resolveEntreprise('Autre', contacts, { siret: '123 456 789' }).id).toBe('c1')
  })
  it('ressemblance acceptée seulement si une seule entreprise correspond', () => {
    expect(resolveEntreprise('Costa', contacts).id).toBe('c1')
    expect(resolveEntreprise('Martin', contacts)).toBeNull()
    expect(resolveEntreprise('', contacts)).toBeNull()
  })
})

describe('scoreCompanies', () => {
  const data = {
    contacts,
    tasks: [
      { entreprise: 'Costa Plomberie', statut: 'Terminé' },
      { entreprise: 'costa plomberie', statut: 'En cours', echeance: '2026-10-01', nb_rappels: 1 },
      { entreprise: 'Martin', statut: 'Terminé' }, // ambigu : ignoré
      { entreprise: '', statut: 'Terminé' },
    ],
    compteRendus: [
      { statut: 'Diffusé', intervenants: [{ nom: 'Jean Costa', societe: 'Costa Plomberie', presence: 'Présent' }, { nom: 'Électricité Martin', presence: 'Absent' }] },
      { statut: 'Brouillon', intervenants: [{ nom: 'Électricité Martin', presence: 'Présent' }] },
    ],
    ordresService: [{ artisan_nom: 'Costa Plomberie', chantier_id: 'ch1', montant_ht: 2000 }],
    today: TODAY,
  }
  it('seules les entreprises soumises à la vigilance et actives sont notées', () => {
    const map = scoreCompanies(data)
    expect([...map.keys()].sort()).toEqual(['c1', 'c2', 'c3'])
    expect(isScored(contacts[3])).toBe(false)
  })
  it('rassemble actions, réunions, avis et historique', () => {
    const s = scoreCompanies(data).get('c1')
    const by = Object.fromEntries(s.criteria.map(c => [c.key, c]))
    expect(by.documents.known).toBe(false) // suivi des documents non fourni
    expect(by.actions.detail).toBe('1 faite sur 2 · 1 en retard · 1 relance')
    expect(by.reunions.detail).toBe('1/1 présent')
    expect(by.avis.points).toBe(20)
    expect(s.historique.os).toBe(1)
    expect(scoreCompanies(data).get('c2').criteria.find(c => c.key === 'reunions').detail).toBe('0/1 présent · 1 absence')
  })
  it('suivi des documents fourni : une entreprise sans document a 0 au critère', () => {
    const map = scoreCompanies({ ...data, byContact: new Map() })
    const doc = map.get('c3').criteria.find(c => c.key === 'documents')
    expect(doc.known).toBe(true)
    expect(doc.points).toBe(0)
    expect(map.get('c3').score).toBe(0)
  })
})

describe('ranking / specialites', () => {
  it('meilleure en tête, sans note à la fin, filtre par spécialité', () => {
    const scores = scoreCompanies({ contacts, today: TODAY, compteRendus: [{ intervenants: [{ nom: 'Martin Peinture', presence: 'Excusé' }] }] })
    const r = ranking(contacts, scores)
    expect(r.map(x => x.contact.id)).toEqual(['c1', 'c3', 'c2'])
    expect(ranking(contacts, scores, { specialite: 'peinture' }).map(x => x.contact.id)).toEqual(['c3'])
    expect(ranking(contacts, scores, { q: 'costa' }).map(x => x.contact.id)).toEqual(['c1'])
    expect(specialites(contacts)).toEqual(['Électricité', 'Peinture', 'Plomberie'])
  })
})
