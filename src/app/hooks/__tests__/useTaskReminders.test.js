/**
 * Tests de la logique pure `computeReminderTriggers`.
 *
 * Le hook lui-même (effets de bord : Notification, localStorage, setInterval)
 * n'est pas testé ici. La logique pure couvre les cas métier :
 *   - tâches Terminé ou sans échéance ignorées
 *   - en retard / aujourd'hui / demain → 1 trigger
 *   - body enrichi du nom de chantier si dispo
 *   - support de chantierId comme chantier_id
 *   - dedupKey = (taskId, type, today)
 */
import { computeReminderTriggers } from '../useTaskReminders'

const TODAY = '2026-05-12'
const YESTERDAY = '2026-05-11'
const TOMORROW = '2026-05-13'
const LATER = '2026-05-20'

const chantiers = [
  { id: 'c1', nom: 'Tour Bayard' },
  { id: 'c2', nom: 'Quai Southampton' },
]

describe('computeReminderTriggers', () => {
  it('renvoie un tableau vide si aucune tâche', () => {
    expect(computeReminderTriggers([], chantiers, TODAY)).toEqual([])
    expect(computeReminderTriggers(undefined, undefined, TODAY)).toEqual([])
  })

  it('ignore les tâches sans échéance', () => {
    const tasks = [{ id: 't1', titre: 'X', statut: 'En cours', echeance: null }]
    expect(computeReminderTriggers(tasks, chantiers, TODAY)).toEqual([])
  })

  it('ignore les tâches Terminé', () => {
    const tasks = [{ id: 't1', titre: 'X', statut: 'Terminé', echeance: YESTERDAY }]
    expect(computeReminderTriggers(tasks, chantiers, TODAY)).toEqual([])
  })

  it('ignore les tâches dont l\'échéance est au-delà de demain', () => {
    const tasks = [{ id: 't1', titre: 'X', statut: 'En cours', echeance: LATER }]
    expect(computeReminderTriggers(tasks, chantiers, TODAY)).toEqual([])
  })

  it('détecte une tâche en retard', () => {
    const tasks = [{ id: 't1', titre: 'Couler dalle', statut: 'En cours', echeance: YESTERDAY, chantierId: 'c1' }]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      taskId: 't1',
      type: 'overdue',
      dedupKey: `taskReminder:t1:overdue:${TODAY}`,
    })
    expect(out[0].title).toMatch(/En retard/)
    expect(out[0].title).toMatch(/Couler dalle/)
    expect(out[0].body).toMatch(/Tour Bayard/)
    expect(out[0].body).toMatch(/2026-05-11/)
  })

  it('détecte une tâche due aujourd\'hui', () => {
    const tasks = [{ id: 't2', titre: 'Réception MOA', statut: 'En cours', echeance: TODAY, chantierId: 'c2' }]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('dueToday')
    expect(out[0].title).toMatch(/Aujourd'hui/)
    expect(out[0].body).toBe('Quai Southampton')
  })

  it('détecte une tâche due demain', () => {
    const tasks = [{ id: 't3', titre: 'Livrer plans', statut: 'Planifié', echeance: TOMORROW, chantierId: 'c1' }]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('dueTomorrow')
    expect(out[0].title).toMatch(/Demain/)
    expect(out[0].body).toMatch(/Tour Bayard/)
  })

  it('accepte chantier_id (snake_case) en plus de chantierId', () => {
    const tasks = [{ id: 't4', titre: 'Audit', statut: 'En cours', echeance: TODAY, chantier_id: 'c1' }]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out[0].body).toBe('Tour Bayard')
  })

  it('renvoie un body avec date si le chantier est introuvable', () => {
    const tasks = [{ id: 't5', titre: 'Orpheline', statut: 'En cours', echeance: TODAY, chantierId: 'nope' }]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out[0].body).toMatch(/2026-05-12/)
  })

  it('génère un trigger par tâche éligible', () => {
    const tasks = [
      { id: 't1', titre: 'A', statut: 'En cours', echeance: YESTERDAY, chantierId: 'c1' },
      { id: 't2', titre: 'B', statut: 'En cours', echeance: TODAY, chantierId: 'c1' },
      { id: 't3', titre: 'C', statut: 'En cours', echeance: TOMORROW, chantierId: 'c1' },
      { id: 't4', titre: 'D', statut: 'Terminé', echeance: YESTERDAY, chantierId: 'c1' },
      { id: 't5', titre: 'E', statut: 'En cours', echeance: LATER, chantierId: 'c1' },
    ]
    const out = computeReminderTriggers(tasks, chantiers, TODAY)
    expect(out.map(o => o.type).sort()).toEqual(['dueToday', 'dueTomorrow', 'overdue'])
  })

  it('dedupKey inclut la date du jour pour permettre une notif par jour', () => {
    const tasks = [{ id: 't1', titre: 'A', statut: 'En cours', echeance: YESTERDAY }]
    const out1 = computeReminderTriggers(tasks, chantiers, '2026-05-12')
    const out2 = computeReminderTriggers(tasks, chantiers, '2026-05-13')
    expect(out1[0].dedupKey).not.toBe(out2[0].dedupKey)
    expect(out1[0].dedupKey).toContain('2026-05-12')
    expect(out2[0].dedupKey).toContain('2026-05-13')
  })

  it('gère sans crash chantiers undefined', () => {
    const tasks = [{ id: 't1', titre: 'X', statut: 'En cours', echeance: TODAY, chantierId: 'c1' }]
    const out = computeReminderTriggers(tasks, undefined, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('dueToday')
  })
})
