import {
  nextCrNumero, previousCr, daysLate, initialRows, newRow, planCrTasks, effectivePriority,
  escalatePriority, priorityLabel, crTaskStats, chantierIntervenants, carryIntervenants,
  actionsFor, crMailText, crMailSubject, defaultNextMeeting, defaultCrDate, isoWeek, fmtLongDate,
} from '../crSuivi'

const CH = 'ch-1'
const crs = [
  { id: 'cr-a', chantier_id: CH, numero: 1, date: '2026-09-16' },
  { id: 'cr-b', chantier_id: CH, numero: 2, date: '2026-09-23', taches_suivi: [
    { id: 't-done-since', suivi: 'en_cours' }, { id: 't-old', suivi: 'fait' },
  ], prochaine_reunion: { date: '2026-09-30', heure: '14:00', lieu: 'Base vie' },
  intervenants: [
    { nom: 'Martin', societe: 'Martin Élec', email: 'm@ex.fr', convoque: true, presence: 'Absent' },
    { nom: 'Durand', societe: 'Durand Plomberie', email: 'd@ex.fr', convoque: false },
  ] },
  { id: 'cr-x', chantier_id: 'autre', numero: 7, date: '2026-09-20' },
]

const tasks = [
  { id: 't-late', chantier_id: CH, titre: 'Reprise enduit', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-25', entreprise: 'Martin Élec', nb_rappels: 1, cr_origine_numero: 1 },
  { id: 't-ok', chantier_id: CH, titre: 'Pose tableau', statut: 'Planifié', priorite: 'En attente', echeance: '2026-10-10' },
  { id: 't-done-since', chantier_id: CH, titre: 'Évacuation gravats', statut: 'Terminé', priorite: 'En cours' },
  { id: 't-old', chantier_id: CH, titre: 'Vieux point', statut: 'Terminé' },
  { id: 't-other', chantier_id: 'autre', titre: 'Autre chantier', statut: 'En cours' },
]

describe('numérotation', () => {
  it('suit le dernier numéro du chantier (pas le total global)', () => {
    expect(nextCrNumero(crs, CH)).toBe(3)
    expect(nextCrNumero(crs, 'autre')).toBe(8)
    expect(nextCrNumero(crs, 'vide')).toBe(1)
  })
  it('CR précédent : dernier du chantier, ou numéro inférieur en modification', () => {
    expect(previousCr(crs, CH).id).toBe('cr-b')
    expect(previousCr(crs, CH, { numero: 2, excludeId: 'cr-b' }).id).toBe('cr-a')
    expect(previousCr(crs, CH, { numero: 1, excludeId: 'cr-a' })).toBeNull()
  })
})

describe('dates', () => {
  it('jours de retard', () => {
    expect(daysLate('2026-09-25', '2026-09-30')).toBe(5)
    expect(daysLate('2026-10-01', '2026-09-30')).toBe(0)
    expect(daysLate('', '2026-09-30')).toBe(0)
  })
  it('semaine ISO et date longue', () => {
    expect(isoWeek('2026-09-30')).toBe(40)
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(fmtLongDate('2026-09-30')).toMatch(/mercredi 30 septembre 2026/)
  })
  it('date du CR : réunion annoncée si elle n’est pas passée', () => {
    expect(defaultCrDate(crs[1], '2026-09-29')).toBe('2026-09-30')
    expect(defaultCrDate(crs[1], '2026-10-02')).toBe('2026-10-02')
  })
  it('prochaine réunion : +7 jours, même heure et lieu', () => {
    expect(defaultNextMeeting({ crDate: '2026-09-30', previous: crs[1] }))
      .toEqual({ date: '2026-10-07', heure: '14:00', lieu: 'Base vie' })
    expect(defaultNextMeeting({ crDate: '2026-09-30', chantier: { adresse: '1 rue X' } }).lieu).toBe('1 rue X')
  })
})

describe('priorités', () => {
  it('monte d’un cran, plafonnée à Urgent', () => {
    expect(escalatePriority('En attente')).toBe('En cours')
    expect(escalatePriority('En cours')).toBe('Urgent')
    expect(escalatePriority('Urgent')).toBe('Urgent')
    expect(escalatePriority('Faible')).toBe('En cours')
    expect(priorityLabel('Urgent')).toBe('Urgente')
  })
})

describe('initialRows — nouveau CR', () => {
  const rows = initialRows({ tasks, chantierId: CH, crDate: '2026-09-30', previous: crs[1] })
  it('reprend les actions ouvertes : en retard → à relancer, sinon en cours', () => {
    expect(rows.find(r => r.id === 't-late').suivi).toBe('relance')
    expect(rows.find(r => r.id === 't-ok').suivi).toBe('en_cours')
  })
  it('ajoute les actions soldées depuis le CR précédent, pas les anciennes', () => {
    expect(rows.find(r => r.id === 't-done-since').suivi).toBe('fait')
    expect(rows.find(r => r.id === 't-old')).toBeUndefined()
    expect(rows.find(r => r.id === 't-other')).toBeUndefined()
  })
  it('relances en tête', () => {
    expect(rows[0].id).toBe('t-late')
  })
})

describe('initialRows — CR existant', () => {
  it('reprend la photo du CR avec les valeurs à jour des tâches', () => {
    const cr = { id: 'cr-b', taches_suivi: [
      { id: 't-ok', suivi: 'nouveau', titre: 'ancien titre' },
      { id: 'disparue', suivi: 'relance', titre: 'Supprimée', rappels: 2 },
    ] }
    const rows = initialRows({ tasks, chantierId: CH, crDate: '2026-09-23', cr })
    expect(rows[0]).toMatchObject({ id: 't-ok', titre: 'Pose tableau', suivi: 'nouveau', initialSuivi: 'nouveau' })
    expect(rows[1]).toMatchObject({ missing: true, titre: 'Supprimée', rappels: 2 })
  })
  it('ancien CR sans photo : aucune action', () => {
    expect(initialRows({ tasks, chantierId: CH, crDate: '2026-09-23', cr: { id: 'cr-a' } })).toEqual([])
  })
})

describe('planCrTasks', () => {
  let n = 0
  const newId = () => `new-${++n}`
  const base = () => initialRows({ tasks, chantierId: CH, crDate: '2026-09-30', previous: crs[1] })

  it('relance : +1 rappel, priorité relevée, une seule fois par CR', () => {
    const plan = planCrTasks({ rows: base(), crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    const up = plan.updates.find(u => u.id === 't-late')
    expect(up.patch).toMatchObject({ nb_rappels: 2, priorite: 'Urgent', dernier_rappel_cr_id: 'cr-c' })
    expect(plan.snapshot.find(s => s.id === 't-late')).toMatchObject({ suivi: 'relance', rappels: 2, priorite: 'Urgent', origine: 1 })

    // Même CR ré-enregistré : pas de double relance
    const already = base().map(r => (r.id === 't-late'
      ? { ...r, orig: { ...r.orig, dernier_rappel_cr_id: 'cr-c', nb_rappels: 2, priorite: 'Urgent' }, priorite: 'Urgent', rappels: 2 }
      : r))
    const again = planCrTasks({ rows: already, crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    expect(again.updates.find(u => u.id === 't-late')).toBeUndefined()
    expect(effectivePriority(already[0], 'cr-c')).toBe('Urgent')
  })

  it('fait → Terminé ; action déjà terminée non modifiée', () => {
    const rows = base().map(r => (r.id === 't-ok' ? { ...r, suivi: 'fait' } : r))
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    expect(plan.updates.find(u => u.id === 't-ok').patch).toEqual({ statut: 'Terminé' })
    expect(plan.updates.find(u => u.id === 't-done-since')).toBeUndefined()
  })

  it('retirer « Fait » rouvre la tâche ; une tâche soldée après coup reste soldée', () => {
    const rows = base().map(r => (r.id === 't-done-since' ? { ...r, suivi: 'en_cours' } : r))
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    expect(plan.updates.find(u => u.id === 't-done-since').patch).toEqual({ statut: 'En cours' })

    const edit = initialRows({ tasks, chantierId: CH, crDate: '2026-09-23', cr: { id: 'cr-b', taches_suivi: [{ id: 't-done-since', suivi: 'en_cours' }] } })
    expect(planCrTasks({ rows: edit, crId: 'cr-b', crNumero: 2, chantierId: CH, newId }).updates).toEqual([])
  })

  it('nouvelles actions : créées avec le CR d’origine, lignes vides ignorées', () => {
    const rows = [
      { ...newRow({ crDate: '2026-09-30' }), titre: ' Fournir PV essais ', entreprise: 'Durand Plomberie', priorite: 'Urgent' },
      newRow({ crDate: '2026-09-30' }),
    ]
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId: () => 'id-1' })
    expect(plan.inserts).toEqual([expect.objectContaining({
      id: 'id-1', chantier_id: CH, titre: 'Fournir PV essais', entreprise: 'Durand Plomberie',
      priorite: 'Urgent', statut: 'Planifié', cr_origine_id: 'cr-c', cr_origine_numero: 3, echeance: '2026-10-07',
    })])
    expect(plan.snapshot).toEqual([expect.objectContaining({ id: 'id-1', suivi: 'nouveau', origine: 3 })])
  })

  it('modifications (échéance, entreprise) reportées sur la tâche', () => {
    const rows = base().map(r => (r.id === 't-ok' ? { ...r, echeance: '2026-10-20', entreprise: 'Martin Élec' } : r))
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    expect(plan.updates.find(u => u.id === 't-ok').patch).toEqual({ echeance: '2026-10-20', entreprise: 'Martin Élec' })
  })

  it('statistiques', () => {
    const plan = planCrTasks({ rows: base(), crId: 'cr-c', crNumero: 3, chantierId: CH, newId })
    expect(crTaskStats(plan.snapshot)).toMatchObject({ total: 3, relance: 1, en_cours: 1, fait: 1, urgent: 1 })
  })
})

describe('intervenants', () => {
  const data = {
    chantiers: [{ id: CH, client: 'M. Client' }],
    contacts: [
      { id: 'c1', nom: 'M. Client', email: 'client@ex.fr' },
      { id: 'c2', nom: 'Martin', societe: 'Martin Élec', specialite: 'Électricité' },
      { id: 'c3', nom: 'Durand', type: 'Artisan' },
    ],
    ordresService: [{ chantier_id: CH, artisan_nom: 'Martin', artisan_specialite: 'Électricien' }],
    contactChantiers: [{ chantier_id: CH, contact_id: 'c3' }, { chantier_id: CH, contact_id: 'c2' }],
  }
  it('MOA, entreprises des OS puis contacts rattachés, sans doublon', () => {
    const list = chantierIntervenants(data, CH)
    expect(list.map(i => [i.nom, i.role])).toEqual([
      ['M. Client', 'Maître d\'ouvrage'], ['Martin', 'Électricien'], ['Durand', 'Artisan'],
    ])
  })
  it('reprend les convoqués du CR précédent, présents par défaut', () => {
    expect(carryIntervenants(crs[1])).toEqual([expect.objectContaining({ nom: 'Martin', presence: 'Présent', convoque: true })])
  })
})

describe('mails', () => {
  const cr = {
    numero: 3, date: '2026-09-30',
    prochaine_reunion: { date: '2026-10-07', heure: '14:00', lieu: 'Base vie' },
    taches_suivi: [
      { titre: 'Reprise enduit', entreprise: 'Martin Élec', echeance: '2026-09-25', suivi: 'relance', rappels: 2, priorite: 'Urgent' },
      { titre: 'Pose tableau', entreprise: 'martin élec', echeance: '2026-10-10', suivi: 'en_cours', priorite: 'En cours' },
      { titre: 'Soldé', entreprise: 'Martin Élec', suivi: 'fait' },
      { titre: 'Autre', entreprise: 'Durand', suivi: 'nouveau' },
    ],
  }
  it('objet avec la convocation', () => {
    expect(crMailSubject(cr, { nom: 'Villa Dupont' })).toBe('Compte rendu de chantier n°3 — Villa Dupont — convocation le 07/10/2026')
  })
  it('actions de l’entreprise, relances et convocation', () => {
    const text = crMailText({ intro: 'Ci-joint le CR.', cr, it: { nom: 'Martin', societe: 'Martin Élec', convoque: true }, company: { nom: 'SARL ID MAÎTRISE' } })
    expect(text).toContain('Bonjour Martin,')
    expect(text).toContain('mercredi 7 octobre 2026 à 14h00')
    expect(text).toContain('lieu : Base vie')
    expect(text).toContain('Reprise enduit — échéance 25/09/2026 — RELANCE n°2 — URGENT')
    expect(text).toContain('Pose tableau — échéance 10/10/2026')
    expect(text).not.toContain('Soldé')
    expect(text).not.toContain('Autre')
    expect(text).toContain('Les points relancés étaient attendus')
    expect(actionsFor(cr.taches_suivi, { nom: 'Durand' })).toHaveLength(1)
  })
  it('non convoqué et sans action : ni convocation ni liste', () => {
    const text = crMailText({ intro: 'Ci-joint.', cr, it: { nom: 'BET', convoque: false } })
    expect(text).not.toContain('convoqué')
    expect(text).not.toContain('Actions à votre charge')
  })
})
