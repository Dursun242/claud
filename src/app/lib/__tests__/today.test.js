import { buildAgenda, buildClientOverview, localISO, addDaysISO } from '../today'
import { parseNewIntent, newIntent } from '../navIntent'

const TODAY = '2026-09-22'

const data = {
  chantiers: [{ id: 'ch1', nom: 'Maison Dupont' }, { id: 'ch2', nom: 'Bureaux Port' }],
  tasks: [
    { id: 't1', titre: 'Relancer plombier', statut: 'En cours', echeance: '2026-09-20', chantierId: 'ch1' },
    { id: 't2', titre: 'Commander carrelage', statut: 'Planifié', echeance: TODAY, chantierId: 'ch2' },
    { id: 't3', titre: 'Déjà fait', statut: 'Terminé', echeance: '2026-09-01', chantierId: 'ch1' },
    { id: 't4', titre: 'Plus tard', statut: 'Planifié', echeance: '2026-10-10', chantierId: 'ch1' },
    { id: 't5', titre: 'Sans échéance', statut: 'Planifié', echeance: null },
  ],
  ordresService: [
    { id: 'os1', numero: 'OS-2026-001', artisan_nom: 'Costa', statut_signature: 'Envoyé', chantier_id: 'ch1' },
    { id: 'os2', numero: 'OS-2026-002', artisan_nom: 'Lefèvre', statut_signature: 'Signé' },
    { id: 'os3', numero: 'OS-2026-003', artisan_nom: 'Bois', statut_signature: 'Partiellement signé' },
  ],
  rdv: [
    { id: 'r2', titre: 'Visite MOA', date: TODAY, heure: '14:00', lieu: 'Bureau', chantierId: 'ch2' },
    { id: 'r1', titre: 'Réunion hebdo', date: TODAY, heure: '09:00', chantierId: 'ch1' },
    { id: 'r3', titre: 'Réception', date: '2026-09-25', heure: '10:00' },
    { id: 'r4', titre: 'Trop loin', date: '2026-11-01' },
  ],
  planning: [
    { id: 'p1', lot: 'Électricité', tache: 'Tirage câbles', debut: TODAY, fin: '2026-10-05', avancement: 0, chantierId: 'ch1' },
    { id: 'p2', lot: 'Peinture', debut: '2026-09-01', fin: TODAY, avancement: 90 },
    { id: 'p3', lot: 'Maçonnerie', debut: '2026-08-01', fin: '2026-09-10', avancement: 60, chantierId: 'ch2' },
    { id: 'p4', lot: 'Plomberie', debut: '2026-08-01', fin: '2026-09-10', avancement: 100 },
    { id: 'p5', lot: 'Menuiserie', debut: '2026-10-01', fin: '2026-10-20', avancement: 0 },
  ],
  compteRendus: [
    { id: 'cr1', numero: 3, date: '2026-09-01', resume: 'Ancien' },
    { id: 'cr2', numero: 4, date: '2026-09-15', resume: 'Récent', chantierId: 'ch1' },
  ],
}

describe('buildAgenda', () => {
  const a = buildAgenda(data, { today: TODAY })

  it('liste les RDV du jour triés par heure, avec le chantier', () => {
    expect(a.rdvToday.map(r => r.id)).toEqual(['r1', 'r2'])
    expect(a.rdvToday[0].sub).toBe('09:00 · Maison Dupont')
  })

  it('garde les RDV à venir dans l’horizon (7 j par défaut)', () => {
    expect(a.rdvUpcoming.map(r => r.id)).toEqual(['r3'])
  })

  it('sépare tâches en retard et tâches du jour, ignore terminées et sans échéance', () => {
    expect(a.tasksOverdue.map(t => t.id)).toEqual(['t1'])
    expect(a.tasksOverdue[0]).toMatchObject({ late: true, tab: 'tasks', focus: 't1' })
    expect(a.tasksToday.map(t => t.id)).toEqual(['t2'])
  })

  it('remonte les OS en attente de signature', () => {
    expect(a.osToSign.map(o => o.id)).toEqual(['os1', 'os3'])
    expect(a.osToSign[0]).toMatchObject({ tab: 'os', focus: 'os1' })
  })

  it('détecte les phases qui démarrent, finissent ou sont en retard', () => {
    const byId = Object.fromEntries(a.phases.map(p => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['p1', 'p2', 'p3'])
    expect(byId.p1.sub).toMatch(/Démarre/)
    expect(byId.p2.sub).toMatch(/Se termine/)
    expect(byId.p3).toMatchObject({ late: true })
  })

  it('compte le total, relances incluses', () => {
    const withRel = buildAgenda(data, { today: TODAY, relances: [{ id: 'i1' }] })
    expect(withRel.count).toBe(a.count + 1)
    expect(a.count).toBe(2 + 1 + 1 + 2 + 3)
  })

  it('tolère un dataset vide', () => {
    expect(buildAgenda({}, { today: TODAY }).count).toBe(0)
  })
})

describe('buildClientOverview', () => {
  const o = buildClientOverview(data, { today: TODAY })

  it('phases en cours triées par fin, avancement borné', () => {
    expect(o.enCours.map(p => p.id)).toEqual(['p2', 'p1'])
    expect(o.enCours[1]).toMatchObject({ avancement: 0, chantier: 'Maison Dupont' })
  })

  it('prochaines étapes dans les 30 jours', () => {
    expect(o.aVenir.map(p => p.id)).toEqual(['p5'])
  })

  it('dernier CR = le plus récent', () => {
    expect(o.dernierCR).toMatchObject({ id: 'cr2', numero: 4, chantier: 'Maison Dupont' })
  })

  it('OS à signer', () => {
    expect(o.osToSign).toHaveLength(2)
  })

  it('aucun CR → null', () => {
    expect(buildClientOverview({}, { today: TODAY }).dernierCR).toBeNull()
  })
})

describe('dates locales', () => {
  it('localISO formate en AAAA-MM-JJ', () => {
    expect(localISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
  it('addDaysISO traverse les mois', () => {
    expect(addDaysISO('2026-01-30', 3)).toBe('2026-02-02')
  })
})

describe('navIntent', () => {
  it('construit et relit les intentions de création', () => {
    expect(newIntent()).toBe('new')
    expect(newIntent('ch1')).toBe('new:ch1')
    expect(parseNewIntent('new')).toEqual({ chantierId: '' })
    expect(parseNewIntent('new:ch1')).toEqual({ chantierId: 'ch1' })
  })
  it('ignore les ids ordinaires', () => {
    expect(parseNewIntent('ch1')).toBeNull()
    expect(parseNewIntent(null)).toBeNull()
    expect(parseNewIntent('newsletter')).toBeNull()
  })
})
