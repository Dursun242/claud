import { enqueue, readOutbox, flushOutbox, clearOfflineData, isNetworkError, OUTBOX_EVENT } from '../offlineStore'

const EMAIL = 'Chef@IDM.fr'

beforeEach(() => localStorage.clear())

describe('file d’attente hors ligne', () => {
  it('enqueue : une seule opération par clé (la dernière gagne), rangée par utilisateur', () => {
    enqueue(EMAIL, { type: 'task', payload: { id: 't1', statut: 'Terminé' }, dedupeKey: 'task:t1' })
    enqueue(EMAIL, { type: 'task', payload: { id: 't2', statut: 'Terminé' }, dedupeKey: 'task:t2' })
    enqueue(EMAIL, { type: 'task', payload: { id: 't1', statut: 'En attente' }, dedupeKey: 'task:t1' })
    const ops = readOutbox('chef@idm.fr')
    expect(ops.map(o => o.payload)).toEqual([{ id: 't2', statut: 'Terminé' }, { id: 't1', statut: 'En attente' }])
    expect(readOutbox('autre@idm.fr')).toEqual([])
  })

  it('flushOutbox envoie dans l’ordre et s’arrête au premier échec (le reste reste en file)', async () => {
    enqueue(EMAIL, { type: 'task', payload: { id: 'a' } })
    enqueue(EMAIL, { type: 'task', payload: { id: 'b' } })
    enqueue(EMAIL, { type: 'task', payload: { id: 'c' } })
    const sent = []
    const r = await flushOutbox(EMAIL, { task: async (p) => { if (p.id === 'b') throw new Error('réseau'); sent.push(p.id) } })
    expect(sent).toEqual(['a'])
    expect(r).toEqual({ sent: 1, remaining: 2 })
    const r2 = await flushOutbox(EMAIL, { task: async (p) => { sent.push(p.id) } })
    expect(sent).toEqual(['a', 'b', 'c'])
    expect(r2).toEqual({ sent: 2, remaining: 0 })
    expect(readOutbox(EMAIL)).toEqual([])
  })

  it('prévient l’interface à chaque changement de la file', () => {
    const counts = []
    const on = (e) => counts.push(e.detail.count)
    window.addEventListener(OUTBOX_EVENT, on)
    enqueue(EMAIL, { type: 'task', payload: {} })
    window.removeEventListener(OUTBOX_EVENT, on)
    expect(counts).toEqual([1])
  })

  it('la déconnexion efface le profil mais garde les modifications non envoyées', async () => {
    localStorage.setItem('idm_profile:chef@idm.fr', '{"role":"admin"}')
    enqueue(EMAIL, { type: 'task', payload: { id: 'a' } })
    await clearOfflineData()
    expect(localStorage.getItem('idm_profile:chef@idm.fr')).toBeNull()
    expect(readOutbox(EMAIL)).toHaveLength(1)
  })

  it('isNetworkError distingue réseau et erreur métier', () => {
    expect(isNetworkError(new Error('Erreur mise à jour tâche : TypeError: Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Load failed'))).toBe(true)
    expect(isNetworkError(new Error('Erreur mise à jour tâche : permission denied'))).toBe(false)
  })
})
