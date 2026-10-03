/**
 * @jest-environment node
 */
import { planWorkForDevis, planSummary, planFailure, taskTitleForDevis, closeDevisFollowUps } from '../devisWon'

// Faux client Supabase : tables en mémoire, sous-ensemble des appels utilisés
function fakeAdmin(tables) {
  const db = { chantiers: [], taches: [], contact_chantiers: [], crm_opportunites: [], contacts: [], ...tables }
  let seq = 0
  const query = (table) => {
    let rows = db[table]
    const filters = []
    const q = {
      select: () => q,
      eq: (col, val) => { filters.push(r => r[col] === val); return q },
      limit: async () => ({ data: rows.filter(r => filters.every(f => f(r))), error: null }),
      maybeSingle: async () => ({ data: rows.find(r => filters.every(f => f(r))) || null, error: null }),
      insert: (row) => {
        const saved = { id: `${table}-${++seq}`, ...row }
        db[table].push(saved)
        const res = { data: saved, error: null }
        return { select: () => ({ single: async () => res }), then: (ok) => ok(res) }
      },
      update: (patch) => ({ eq: async (col, val) => { rows.filter(r => r[col] === val).forEach(r => Object.assign(r, patch)); return { error: null } } }),
    }
    return q
  }
  return { db, from: jest.fn(query) }
}

const DEVIS = { id: 'd1', numero: 'D-2026-041', objet: 'Rénovation cuisine', opportunite_id: 'o1', total_ht: 12000 }

describe('planWorkForDevis', () => {
  it('crée le chantier depuis l’affaire, le rattache, puis ajoute la tâche « Lancer les travaux »', async () => {
    const admin = fakeAdmin({
      crm_opportunites: [{ id: 'o1', titre: 'Cuisine Dupont', contact_id: 'c1', chantier_id: null, adresse: '3 rue X', notes: null }],
      contacts: [{ id: 'c1', nom: 'Dupont', societe: null, adresse: null }],
    })
    const plan = await planWorkForDevis(admin, DEVIS)
    expect(plan.chantierCreated).toBe(true)
    expect(plan.taskCreated).toBe(true)
    const [ch] = admin.db.chantiers
    expect(ch).toMatchObject({ nom: 'Cuisine Dupont', client: 'Dupont', adresse: '3 rue X', budget: 12000, statut: 'Planifié' })
    expect(ch.notes_internes).toMatch(/devis D-2026-041 signé/)
    expect(admin.db.crm_opportunites[0].chantier_id).toBe(ch.id)
    expect(admin.db.contact_chantiers).toEqual([expect.objectContaining({ contact_id: 'c1', chantier_id: ch.id })])
    const [task] = admin.db.taches
    expect(task).toMatchObject({ chantier_id: ch.id, titre: 'Lancer les travaux — devis D-2026-041 signé', priorite: 'Urgent', statut: 'Planifié' })
    expect(task.echeance).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('réutilise le chantier déjà rattaché à l’affaire', async () => {
    const admin = fakeAdmin({
      crm_opportunites: [{ id: 'o1', titre: 'Cuisine Dupont', chantier_id: 'ch-9' }],
      chantiers: [{ id: 'ch-9', nom: 'Chantier existant' }],
    })
    const plan = await planWorkForDevis(admin, DEVIS, { how: 'accepté dans Qonto' })
    expect(plan).toMatchObject({ chantier: { id: 'ch-9' }, chantierCreated: false, taskCreated: true })
    expect(admin.db.chantiers).toHaveLength(1)
    expect(admin.db.taches[0].titre).toBe('Lancer les travaux — devis D-2026-041 accepté dans Qonto')
  })

  it('idempotent : un second appel ne crée ni chantier ni tâche en double', async () => {
    const admin = fakeAdmin({ crm_opportunites: [{ id: 'o1', titre: 'Cuisine Dupont', chantier_id: null }] })
    await planWorkForDevis(admin, DEVIS)
    const again = await planWorkForDevis(admin, DEVIS)
    expect(again).toMatchObject({ chantierCreated: false, taskCreated: false })
    expect(admin.db.chantiers).toHaveLength(1)
    expect(admin.db.taches).toHaveLength(1)
  })

  it('sans affaire : chantier nommé d’après l’objet du devis', async () => {
    const admin = fakeAdmin({})
    const plan = await planWorkForDevis(admin, { ...DEVIS, opportunite_id: null })
    expect(plan.chantier.nom).toBe('Rénovation cuisine')
  })

  it('ne lève jamais (erreur base journalisée)', async () => {
    const log = { warn: jest.fn() }
    const admin = { from: () => { throw new Error('base indisponible') } }
    await expect(planWorkForDevis(admin, DEVIS, { log })).resolves.toEqual({ chantier: null, chantierCreated: false, taskCreated: false, failed: true })
    expect(log.warn).toHaveBeenCalled()
  })

  it('échec du rattachement chantier/affaire → crée quand même la tâche et le signale', async () => {
    const log = { warn: jest.fn() }
    const admin = fakeAdmin({ crm_opportunites: [{ id: 'o1', titre: 'Cuisine Dupont', chantier_id: null }] })
    const from = admin.from.getMockImplementation()
    admin.from.mockImplementation((table) => {
      const q = from(table)
      if (table === 'crm_opportunites') q.update = () => ({ eq: async () => ({ error: { message: 'RLS' } }) })
      return q
    })
    const plan = await planWorkForDevis(admin, DEVIS, { log })
    expect(plan).toMatchObject({ chantierCreated: true, taskCreated: true, failed: true })
    expect(admin.db.taches).toHaveLength(1)
    expect(log.warn).toHaveBeenCalledWith('rattachement chantier/affaire', 'RLS')
  })

  it('échec de lecture des tâches existantes → aucune tâche créée (pas de doublon)', async () => {
    const log = { warn: jest.fn() }
    const admin = fakeAdmin({
      crm_opportunites: [{ id: 'o1', titre: 'Cuisine Dupont', chantier_id: 'ch-9' }],
      chantiers: [{ id: 'ch-9', nom: 'Chantier existant' }],
    })
    const from = admin.from.getMockImplementation()
    admin.from.mockImplementation((table) => {
      const q = from(table)
      if (table === 'taches') q.limit = async () => ({ data: null, error: { message: 'timeout' } })
      return q
    })
    const plan = await planWorkForDevis(admin, DEVIS, { log })
    expect(plan).toMatchObject({ chantier: { id: 'ch-9' }, taskCreated: false, failed: true })
    expect(admin.db.taches).toHaveLength(0)
    expect(log.warn).toHaveBeenCalledWith('planification des travaux', expect.stringMatching(/lecture tâche : timeout/))
  })

  it('planFailure : ligne d’échec seulement quand la planification a échoué', () => {
    expect(planFailure(null)).toBeNull()
    expect(planFailure({ chantier: { nom: 'X' }, chantierCreated: true, taskCreated: true })).toBeNull()
    expect(planFailure({ chantier: null, failed: true })).toBe('Chantier et tâche non créés automatiquement : à faire à la main.')
    expect(planFailure({ chantier: { nom: 'X' }, failed: true })).toMatch(/Planification incomplète pour « X ».*à faire à la main/)
  })

  it('planSummary / taskTitleForDevis', () => {
    expect(planSummary({ chantier: { nom: 'X' }, chantierCreated: true, taskCreated: true })).toMatch(/Chantier créé : « X » · tâche/)
    expect(planSummary(null)).toBeNull()
    expect(taskTitleForDevis({ numero: 'D-1' })).toBe('Lancer les travaux — devis D-1 signé')
  })
})

describe('closeDevisFollowUps', () => {
  function chainAdmin({ error = null, rows = [{ id: 'i1' }] } = {}) {
    const calls = []
    const b = {
      update: (p) => { calls.push(['update', p]); return b },
      eq: (c, v) => { calls.push(['eq', c, v]); return b },
      not: (c, op, v) => { calls.push(['not', c, op, v]); return b },
      ilike: (c, v) => { calls.push(['ilike', c, v]); return b },
      select: async () => ({ data: error ? null : rows, error }),
    }
    return { calls, from: (t) => { calls.push(['from', t]); return b } }
  }
  it('affaire gagnée : toutes ses relances ouvertes soldées', async () => {
    const admin = chainAdmin({ rows: [{ id: 'a' }, { id: 'b' }] })
    expect(await closeDevisFollowUps(admin, DEVIS, { wholeOpp: true })).toBe(2)
    expect(admin.calls).toEqual(expect.arrayContaining([
      ['from', 'crm_interactions'], ['update', { action_faite: true }], ['eq', 'opportunite_id', 'o1'], ['eq', 'action_faite', false],
    ]))
    expect(admin.calls.some(c => c[0] === 'ilike')).toBe(false)
  })
  it('devis refusé : seulement les relances de ce devis ; erreur sans effet', async () => {
    const admin = chainAdmin()
    await closeDevisFollowUps(admin, DEVIS)
    expect(admin.calls).toContainEqual(['ilike', 'sujet', 'Devis D-2026-041 %'])
    const warn = jest.fn()
    expect(await closeDevisFollowUps(chainAdmin({ error: { message: 'boom' } }), DEVIS, { log: { warn } })).toBe(0)
    expect(warn).toHaveBeenCalled()
    expect(await closeDevisFollowUps(chainAdmin(), { numero: 'X' })).toBe(0)
  })
})
