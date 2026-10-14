import {
  nextCrNumero, previousCr, daysLate, initialRows, newRow, planCrTasks, effectivePriority,
  nextPointNumber, plannedProgress, buildSections, globalProgress, sectionsForDb, aiContext, applyAiResult,
  guessEntreprise, GENERAL, lotOf, lotKey, rowAiId, similarText, withComplement, mergeText,
  escalatePriority, priorityLabel, crTaskStats, chantierIntervenants, carryIntervenants,
  actionsFor, crMailText, crMailSubject, defaultNextMeeting, defaultCrDate, isoWeek, fmtLongDate,
  formalTitle, relanceLevel, crChecks, markConvoques, absences, absenceText, crAgenda,
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
  { id: 't-late', chantier_id: CH, titre: 'Reprise enduit', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-25', entreprise: 'Martin Élec', nb_rappels: 1, cr_origine_numero: 1, num_point: 1, lot: 'Électricité' },
  { id: 't-ok', chantier_id: CH, titre: 'Pose tableau', statut: 'Planifié', priorite: 'En attente', echeance: '2026-10-10', num_point: 2, lot: 'Électricité' },
  { id: 't-done-since', chantier_id: CH, titre: 'Évacuation gravats', statut: 'Terminé', priorite: 'En cours', num_point: 3 },
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
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId: () => 'id-1', nextNum: 4 })
    expect(plan.inserts).toEqual([expect.objectContaining({
      id: 'id-1', chantier_id: CH, titre: 'Fournir PV essais', entreprise: 'Durand Plomberie', num_point: 4, lot: null,
      priorite: 'Urgent', statut: 'Planifié', cr_origine_id: 'cr-c', cr_origine_numero: 3, echeance: '2026-10-07',
    })])
    expect(plan.snapshot).toEqual([expect.objectContaining({ id: 'id-1', num: 4, lot: GENERAL, suivi: 'nouveau', origine: 3 })])
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
  it('email travaux utilisé pour les comptes rendus, sinon l’email administratif', () => {
    const d = { ...data, contacts: [{ ...data.contacts[0] }, { ...data.contacts[1], email: 'admin@martin.fr', email_travaux: 'chantier@martin.fr' }, data.contacts[2]] }
    const list = chantierIntervenants(d, CH)
    expect(list.map(i => i.email)).toEqual(['client@ex.fr', 'chantier@martin.fr', ''])
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
    expect(text).toContain('Reprise enduit — échéance 25/09/2026 — DERNIER RAPPEL AVANT MISE EN DEMEURE — URGENT')
    expect(text).toContain('Pose tableau — échéance 10/10/2026')
    expect(text).not.toContain('Soldé')
    expect(text).not.toContain('Autre')
    expect(text).toContain('Les points relancés étaient attendus')
    expect(actionsFor(cr.taches_suivi, { nom: 'Durand' })).toHaveLength(1)
  })
  it('lien de réponse sous les actions', () => {
    const link = 'https://app.test/actions/abc'
    const text = crMailText({ intro: 'Ci-joint.', cr, it: { nom: 'Martin', societe: 'Martin Élec' }, link })
    expect(text).toContain(`sans créer de compte :\n${link}`)
    expect(crMailText({ intro: 'Ci-joint.', cr, it: { nom: 'BET' }, link })).not.toContain(link)
  })
  it('non convoqué et sans action : ni convocation ni liste', () => {
    const text = crMailText({ intro: 'Ci-joint.', cr, it: { nom: 'BET', convoque: false } })
    expect(text).not.toContain('convoqué')
    expect(text).not.toContain('Actions à votre charge')
  })
})

describe('numéros de point', () => {
  it('suivent le plus grand numéro du chantier', () => {
    expect(nextPointNumber(tasks, CH)).toBe(4)
    expect(nextPointNumber(tasks, 'vide')).toBe(1)
  })
  it('un point existant sans numéro en reçoit un, gardé ensuite', () => {
    const old = { id: 'old', chantier_id: CH, titre: 'Ancien', statut: 'En cours', priorite: 'En cours', echeance: '2026-12-01' }
    const rows = initialRows({ tasks: [old], chantierId: CH, crDate: '2026-09-30' })
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId: () => 'x', nextNum: 7 })
    expect(plan.updates).toEqual([{ id: 'old', patch: { num_point: 7 } }])
    expect(plan.snapshot[0]).toMatchObject({ num: 7, lot: GENERAL })
  })
  it('changement de lot et photos reportés sur la tâche (photos locales ignorées)', () => {
    const rows = initialRows({ tasks, chantierId: CH, crDate: '2026-09-30' }).map(r => (r.id === 't-ok'
      ? { ...r, lot: 'Plomberie', photos: [{ path: 'chantier/x/1.jpg', legende: 'avant' }, { dataUrl: 'data:…' }] } : r))
    const plan = planCrTasks({ rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId: () => 'x', nextNum: 9 })
    expect(plan.updates.find(u => u.id === 't-ok').patch).toEqual({ lot: 'Plomberie', photos: [{ path: 'chantier/x/1.jpg', legende: 'avant' }] })
  })
})

describe('sections par lot', () => {
  const chantier = { id: CH, lots: ['Électricité', 'Plomberie'] }
  const planning = [
    { chantier_id: CH, lot: 'Électricité', tache: 'Câblage', debut: '2026-09-01', fin: '2026-10-31' },
    { chantier_id: CH, lot: 'Plomberie', tache: 'Réseaux', debut: '2026-09-01', fin: '2026-09-10' },
  ]
  it('avancement prévu d’après le planning', () => {
    expect(plannedProgress(planning, CH, 'électricité', '2026-09-30')).toBe(48)
    expect(plannedProgress(planning, CH, 'Plomberie', '2026-09-30')).toBe(100)
    expect(plannedProgress(planning, CH, 'Peinture', '2026-09-30')).toBeNull()
  })
  it('entreprise devinée d’après les OS', () => {
    const os = [{ chantier_id: CH, artisan_nom: 'Martin', artisan_specialite: 'Électricité générale' }]
    expect(guessEntreprise(os, CH, 'Électricité')).toBe('Martin')
    expect(guessEntreprise(os, CH, 'electricite', [{ nom: 'Martin', societe: 'Martin Élec' }])).toBe('Martin Élec')
    expect(guessEntreprise(os, CH, 'Plomberie')).toBe('')
  })
  it('Généralités, lots du chantier, du CR précédent et des points ; précédent repris', () => {
    const previous = { sections: [{ lot: 'Électricité', entreprise: 'Martin Élec', avancement: 30 }, { lot: 'Menuiseries', avancement: 10 }] }
    const rows = [{ lot: 'Peinture' }, { lot: '' }]
    const secs = buildSections({ chantier, previous, rows, planning, crDate: '2026-09-30' })
    expect(secs.map(s => s.lot)).toEqual([GENERAL, 'Électricité', 'Plomberie', 'Menuiseries', 'Peinture'])
    expect(secs[1]).toMatchObject({ entreprise: 'Martin Élec', avancement: 30, avancement_prec: 30, prevu: 48 })
    expect(secs[2]).toMatchObject({ avancement: null, prevu: 100 })
  })
  it('CR existant : ses sections', () => {
    const cr = { id: 'c', sections: [{ lot: 'Gros œuvre', avancement: 80, observations: 'ok' }] }
    const secs = buildSections({ chantier, cr, rows: [], crDate: '2026-09-30' })
    expect(secs.map(s => s.lot)).toEqual([GENERAL, 'Gros œuvre'])
    expect(secs[1].observations).toBe('ok')
  })
  it('avancement global et enregistrement', () => {
    const secs = [{ key: 'generalites', lot: GENERAL }, { key: 'a', lot: 'A', avancement: 40 }, { key: 'b', lot: 'B', avancement: '' }, { key: 'c', lot: 'C', avancement: 81 }]
    expect(globalProgress(secs)).toBe(61)
    expect(sectionsForDb([{ key: 'a', lot: 'A', avancement: '120', photos: [{ dataUrl: 'x' }, { path: 'p', legende: 'l' }] }]))
      .toEqual([{ lot: 'A', entreprise: '', avancement: 100, avancement_prec: null, prevu: null, observations: '', photos: [{ path: 'p', legende: 'l' }] }])
  })
})

describe('dictée + IA', () => {
  const sections = [
    { key: 'generalites', lot: GENERAL, observations: '' },
    { key: 'electricite', lot: 'Électricité', entreprise: 'Martin Élec', observations: 'Déjà noté.' },
  ]
  const rows = initialRows({ tasks, chantierId: CH, crDate: '2026-09-30' })
  it('contexte envoyé : lots et points existants', () => {
    const ctx = aiContext({ sections, rows })
    expect(ctx.lots).toEqual([{ lot: GENERAL, entreprise: '', observations: '' }, { lot: 'Électricité', entreprise: 'Martin Élec', observations: 'Déjà noté.' }])
    expect(ctx.points.map(p => p.id)).toEqual(['t-late', 't-ok'])
  })
  it('applique la proposition validée', () => {
    const out = applyAiResult({ sections, rows, resume: 'Début.', decisions: '' }, {
      resume: 'Bonne réunion.',
      decisions: 'Carrelage validé.',
      lots: [{ lot: 'electricite', observations: 'Tableau absent.', avancement: 25 }, { lot: 'Peinture', observations: 'Démarrage lundi.', avancement: null }],
      points_existants: [{ id: 't-ok', etat: 'fait', echeance: null }, { id: 't-late', etat: 'relance', echeance: '2026-10-09' }],
      nouveaux_points: [{ lot: 'Électricité', titre: 'Fournir le schéma', entreprise: '', echeance: '2026-10-07', priorite: 'Urgent' }],
    }, { crDate: '2026-09-30' })
    expect(out.resume).toBe('Début.\nBonne réunion.')
    expect(out.decisions).toBe('Carrelage validé.')
    const elec = out.sections.find(s => s.lot === 'Électricité')
    expect(elec).toMatchObject({ observations: 'Déjà noté.\nTableau absent.', avancement: 25 })
    expect(out.sections.map(s => s.lot)).toContain('Peinture')
    expect(out.rows.find(r => r.id === 't-ok').suivi).toBe('fait')
    expect(out.rows.find(r => r.id === 't-late')).toMatchObject({ suivi: 'relance', echeance: '2026-10-09' })
    const added = out.rows.find(r => r.isNew)
    expect(added).toMatchObject({ titre: 'Fournir le schéma', lot: 'Électricité', entreprise: 'Martin Élec', echeance: '2026-10-07', priorite: 'Urgent' })
    expect(lotOf(added)).toBe('Électricité')
  })
})

describe('dictée en plusieurs fois : compléter plutôt que doubler', () => {
  const base = () => {
    const extra = { ...newRow({ crDate: '2026-10-13', lot: 'Plomberie' }), titre: 'Poser le ballon d’eau chaude', entreprise: 'LCM' }
    return {
      sections: [{ key: lotKey('Plomberie'), lot: 'Plomberie', observations: 'Réseaux posés. Attente du ballon.', photos: [] }],
      rows: [extra],
    }
  }

  it('aiContext : les points ajoutés pendant la saisie sont envoyés (id new:…)', () => {
    const { sections, rows } = base()
    const ctx = aiContext({ sections, rows })
    expect(ctx.points).toHaveLength(1)
    expect(ctx.points[0].id).toBe(rowAiId(rows[0]))
    expect(ctx.points[0].id).toMatch(/^new:/)
  })

  it('nouveau point semblable : le point existant est complété, pas doublé', () => {
    const { sections, rows } = base()
    const out = applyAiResult({ sections, rows }, {
      nouveaux_points: [{ lot: 'Plomberie', titre: 'Poser le ballon d’eau chaude de 200 L', entreprise: 'LCM', echeance: '2026-10-20', priorite: 'Urgent' }],
    }, { crDate: '2026-10-13' })
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0].titre).toBe('Poser le ballon d’eau chaude de 200 L')
    expect(out.rows[0].priorite).toBe('Urgent')
  })

  it('point repéré par l’IA : précision ajoutée, état « nouveau » gardé', () => {
    const { sections, rows } = base()
    const out = applyAiResult({ sections, rows }, {
      points_existants: [{ id: rowAiId(rows[0]), etat: 'en_cours', echeance: null, complement: 'dans le cellier' }],
    }, { crDate: '2026-10-13' })
    expect(out.rows[0].titre).toBe('Poser le ballon d’eau chaude — dans le cellier')
    expect(out.rows[0].suivi).toBe('nouveau')
  })

  it('observations et résumé : seules les phrases nouvelles sont ajoutées', () => {
    const { sections, rows } = base()
    const out = applyAiResult({ sections, rows, resume: 'Chantier propre.' }, {
      lots: [{ lot: 'Plomberie', observations: 'Réseaux posés. Le ballon arrive vendredi.', avancement: null }],
      resume: 'Chantier propre. Bonne coordination.',
    }, { crDate: '2026-10-13' })
    expect(out.sections[0].observations).toBe('Réseaux posés. Attente du ballon.\nLe ballon arrive vendredi.')
    expect(out.resume).toBe('Chantier propre.\nBonne coordination.')
  })

  it('points différents : pas fusionnés', () => {
    expect(similarText('Poser le ballon d’eau chaude', 'Reprendre l’enduit de façade')).toBe(false)
    expect(similarText('Nettoyer le chantier', 'Nettoyer le chantier avant vendredi')).toBe(true)
    expect(withComplement('Nettoyer le chantier', 'nettoyer le chantier')).toBe('Nettoyer le chantier')
    expect(mergeText('', 'Texte')).toBe('Texte')
  })
})

describe('rédaction : ton des relances', () => {
  it('le ton se durcit à chaque relance', () => {
    const r = { titre: 'Reprendre l’enduit du séjour', entreprise: 'Leroy', suivi: 'relance', rappels: 1 }
    expect(relanceLevel(r)).toBe(1)
    expect(formalTitle(r)).toBe('Il est rappelé à l\'entreprise Leroy de reprendre l’enduit du séjour.')
    expect(formalTitle({ ...r, titre: 'Évacuer les gravats', rappels: 1 })).toBe('Il est rappelé à l\'entreprise Leroy d\'évacuer les gravats.')
    expect(formalTitle({ ...r, rappels: 2 })).toBe('Dernier rappel avant mise en demeure : l\'entreprise Leroy doit reprendre l’enduit du séjour.')
    expect(formalTitle({ ...r, entreprise: 'SARL Durand', rappels: 3 })).toBe('Dernier rappel avant mise en demeure : SARL Durand doit reprendre l’enduit du séjour.')
  })
  it('point non relancé ou sans entreprise', () => {
    expect(formalTitle({ titre: 'Fournir les échantillons', suivi: 'nouveau', entreprise: 'X' })).toBe('Fournir les échantillons')
    expect(formalTitle({ titre: 'Fournir les DOE', suivi: 'relance', rappels: 1 })).toBe('Rappel : Fournir les DOE.')
    expect(formalTitle({ titre: 'VMC à raccorder', suivi: 'relance', rappels: 1, entreprise: 'Air' })).toBe('Rappel à l\'entreprise Air : VMC à raccorder.')
  })
})

describe('contrôle avant diffusion', () => {
  const form = {
    date: '2026-10-13', prochaine_reunion: { date: '' },
    intervenants: [{ nom: 'Leroy', societe: 'Leroy Plâtrerie', presence: 'Absent', convoque_prec: true }, { nom: 'Bet', presence: 'Excusé' }],
  }
  const rows = [
    { key: 'a', num: 4, titre: 'Fournir les échantillons', entreprise: '', echeance: '', suivi: 'nouveau', lot: 'Carrelage' },
    { key: 'b', num: 5, titre: 'Poser le tableau', entreprise: 'Martin', echeance: '2026-10-01', suivi: 'en_cours', lot: 'Électricité' },
    { key: 'c', num: 6, titre: 'Soldé', entreprise: '', echeance: '', suivi: 'fait', lot: 'Électricité' },
    { key: 'd', num: 7, titre: 'Relancé', entreprise: 'Martin', echeance: '2026-10-01', suivi: 'relance', lot: 'Électricité' },
  ]
  const sections = [
    { key: lotKey(GENERAL), lot: GENERAL, prevu: null },
    { key: 'electricite', lot: 'Électricité', prevu: 60, avancement: null },
    { key: 'carrelage', lot: 'Carrelage', prevu: 20, avancement: 10 },
  ]
  it('pose les questions qui manquent', () => {
    const out = crChecks({ form, rows, sections })
    const q = out.filter(c => c.type === 'question').map(c => c.text)
    expect(q).toEqual([
      'Point n°4 « Fournir les échantillons » : quelle entreprise, pour quand ?',
      'Point n°5 « Poser le tableau » : échéance dépassée (01/10/2026), à relancer ?',
      'Électricité : prévu à 60 % au planning, quel avancement ?',
    ])
    expect(out.find(c => c.key === 'q:a').anchor).toBe('carrelage')
  })
  it('note les absences et l’absence de convocation', () => {
    const infos = crChecks({ form, rows: [], sections: [] }).filter(c => c.type === 'info').map(c => c.text)
    expect(infos).toEqual([
      'Leroy (Leroy Plâtrerie) : absent bien que convoqué (noté au compte rendu).',
      'Bet : excusé (noté au compte rendu).',
      'Pas de prochaine réunion : aucune convocation ne sera envoyée.',
    ])
    expect(crChecks({ form: { date: '2026-10-13' } }).map(c => c.key)).toContain('presences')
  })
  it('absents convoqués au CR précédent', () => {
    const its = markConvoques([{ nom: 'Martin', societe: 'Martin Élec', presence: 'Absent' }, { nom: 'Durand', presence: 'Absent' }], crs[1])
    expect(its.map(i => i.convoque_prec)).toEqual([true, false])
    expect(absences(its).map(absenceText)).toEqual(['Martin (Martin Élec) : absent bien que convoqué', 'Durand : absent'])
    const text = crMailText({ intro: 'Ci-joint.', cr: {}, it: its[0] })
    expect(text).toContain('Vous étiez convoqué(e) à cette réunion et n’étiez ni présent(e) ni représenté(e).')
  })
  it('les alertes de l’IA s’ajoutent sans doublon', () => {
    const out = applyAiResult({ sections: [], rows: [], alertes: 'Retard plâtrerie.' }, { alertes: 'Retard plâtrerie. Fissure en façade nord.' })
    expect(out.alertes).toBe('Retard plâtrerie.\nFissure en façade nord.')
  })
})

describe('points évoqués et ordre du jour', () => {
  it('un point repris n’est pas évoqué tant que personne n’en parle ; l’état est gardé avec le CR', () => {
    const rows = initialRows({ tasks, chantierId: CH, crDate: '2026-09-30', previous: crs[1] })
    expect(rows.find(r => r.id === 't-ok').vu).toBe(false)
    expect(newRow({ crDate: '2026-09-30' }).vu).toBe(true)
    const out = applyAiResult({ sections: [], rows }, { points_existants: [{ id: 't-ok', etat: 'en_cours', echeance: null, complement: '' }] })
    expect(out.rows.find(r => r.id === 't-ok').vu).toBe(true)
    const plan = planCrTasks({ rows: out.rows, crId: 'cr-c', crNumero: 3, chantierId: CH, newId: () => 'n', nextNum: 4 })
    expect(plan.snapshot.find(r => r.id === 't-late').vu).toBe(false)
    const again = initialRows({ tasks, chantierId: CH, crDate: '2026-09-30', cr: { id: 'cr-c', taches_suivi: plan.snapshot } })
    expect(again.find(r => r.id === 't-ok').vu).toBe(true)
    expect(again.find(r => r.id === 't-late').vu).toBe(false)
    // Ancien CR sans l'information : considéré comme évoqué
    expect(initialRows({ tasks, chantierId: CH, crDate: '2026-09-30', cr: { id: 'x', taches_suivi: [{ id: 't-ok', suivi: 'en_cours' }] } })[0].vu).toBe(true)
  })
  it('ordre du jour : interventions prévues avant la prochaine réunion, OS annulés ignorés', () => {
    const groups = crAgenda({
      rows: [], sections: [{ key: 'plomberie', lot: 'Plomberie' }], chantierId: CH, crDate: '2026-09-30', nextDate: '2026-10-07',
      previous: { date: '2026-09-23' },
      ordresService: [
        { id: 'a', chantier_id: CH, numero: 'OS-1', artisan_nom: 'Durand', artisan_specialite: 'Plomberie', date_intervention: '2026-10-05' },
        { id: 'b', chantier_id: CH, numero: 'OS-2', artisan_nom: 'X', date_emission: '2026-09-25', statut: 'Annulé' },
        { id: 'c', chantier_id: CH, numero: 'OS-3', artisan_nom: 'Y', date_intervention: '2026-10-20' },
      ],
    })
    expect(groups).toEqual([{ key: 'os', title: 'Ordres de service', items: [
      { key: 'int:a', anchor: 'plomberie', text: 'Intervention prévue le 05/10/2026 : OS-1 · Durand · Plomberie' },
    ] }])
  })
})

describe('réponses des entreprises dans le CR', () => {
  const t = (rep) => [{ id: 'r1', chantier_id: CH, titre: 'Reprendre l’enduit', entreprise: 'Leroy', statut: 'En cours', echeance: '2026-09-25', num_point: 9, reponse_entreprise: rep }]
  it('nouveau CR : réponse arrivée depuis le CR précédent appliquée, à l’ordre du jour', () => {
    const rows = initialRows({ tasks: t({ type: 'fait', le: '2026-09-28T10:00:00Z', photo: 'chantier/ch/r.jpg' }), chantierId: CH, crDate: '2026-09-30', previous: crs[1] })
    expect(rows[0]).toMatchObject({ suivi: 'fait', initialSuivi: 'relance', reponseRecente: true, photos: [{ path: 'chantier/ch/r.jpg' }] })
    const agenda = crAgenda({ rows, sections: [], chantierId: CH, crDate: '2026-09-30' })
    expect(agenda[0]).toMatchObject({ key: 'reponses', items: [{ text: 'n°9 Reprendre l’enduit · Leroy : Fait' }] })
    // Réponse plus ancienne que le CR précédent : déjà traitée
    expect(initialRows({ tasks: t({ type: 'fait', le: '2026-09-20T10:00:00Z' }), chantierId: CH, crDate: '2026-09-30', previous: crs[1] })[0].suivi).toBe('relance')
  })
  it('désaccord : point inchangé, question avant diffusion', () => {
    const rows = initialRows({ tasks: t({ type: 'desaccord', commentaire: 'Pas notre lot', le: '2026-09-28T10:00:00Z' }), chantierId: CH, crDate: '2026-09-30', previous: crs[1] })
    expect(rows[0].suivi).toBe('relance')
    const q = crChecks({ form: { date: '2026-09-30', intervenants: [{ nom: 'X' }] }, rows }).map(c => c.text)
    expect(q[0]).toBe('Leroy conteste le point n°9 « Reprendre l’enduit » : Désaccord — « Pas notre lot ». À trancher.')
  })
})
