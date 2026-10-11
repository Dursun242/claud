import { chantierGlance } from '../chantierGlance'

const today = '2026-10-12'

describe('chantierGlance', () => {
  it('prochaine réunion annoncée au CR le plus récent', () => {
    const crs = [
      { id: 'a', numero: 3, date: '2026-10-01', prochaine_reunion: { date: '2026-10-08', heure: '09:00' } },
      { id: 'b', numero: 4, date: '2026-10-08', prochaine_reunion: { date: '2026-10-15', heure: '10:30', lieu: 'Sur le chantier' } },
    ]
    expect(chantierGlance({ crs, today }).nextMeeting).toEqual({ date: '2026-10-15', heure: '10:30', lieu: 'Sur le chantier' })
  })

  it('pas de prochaine réunion si elle est passée ou absente', () => {
    expect(chantierGlance({ crs: [{ date: '2026-09-01', prochaine_reunion: { date: '2026-09-08' } }], today }).nextMeeting).toBeNull()
    expect(chantierGlance({ crs: [{ date: '2026-10-01' }], today }).nextMeeting).toBeNull()
    expect(chantierGlance({ today }).nextMeeting).toBeNull()
  })

  it('points de CR ouverts et tâches en retard', () => {
    const tasks = [
      { num_point: 1, statut: 'En cours', echeance: '2026-10-01' },
      { num_point: 2, statut: 'Terminé', echeance: '2026-10-01' },
      { cr_origine_id: 'cr1', statut: 'En attente', echeance: '2026-10-20' },
      { statut: 'En attente', echeance: '2026-10-11' },
      { statut: 'En attente' },
    ]
    const g = chantierGlance({ tasks, today })
    expect(g.openPoints).toBe(2)
    expect(g.lateTasks).toBe(2)
  })

  it('budget engagé seulement si un budget est défini', () => {
    expect(chantierGlance({ finances: { budget: 1000, ratio: 62, depassement: 0 }, today }).budget).toEqual({ ratio: 62, over: 0 })
    expect(chantierGlance({ finances: { budget: 0, ratio: 0 }, today }).budget).toBeNull()
  })
})
