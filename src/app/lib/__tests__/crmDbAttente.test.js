jest.mock('../../supabaseClient', () => ({ supabase: {} }))
jest.mock('../activityLog', () => ({ writeActivityLog: jest.fn() }))

// eslint-disable-next-line import/first
import { mettreEnAttente, reprendreOpportunite, upsertOpportunite, ACTION_REPRISE } from '../crmDb'

// Faux client Supabase : garde les écritures pour les vérifier
function fakeSb() {
  const calls = []
  const sb = {
    calls,
    auth: { getUser: async () => ({ data: { user: { email: 'moe@idm.fr' } } }) },
    from(table) {
      const c = { table, filters: [] }
      calls.push(c)
      const b = {
        update: (row) => { c.op = 'update'; c.row = row; return b },
        insert: (row) => { c.op = 'insert'; c.row = row; return b },
        eq: (k, v) => { c.filters.push(['eq', k, v]); return b },
        not: (k, op, v) => { c.filters.push(['not', k, v]); return b },
        ilike: (k, v) => { c.filters.push(['ilike', k, v]); return b },
        select: () => b,
        single: async () => ({ data: { id: c.row?.id || (table === 'crm_opportunites' ? 'o1' : 'i1'), ...c.row }, error: null }),
        then: (res) => res({ data: [], error: null }),
      }
      return b
    },
  }
  return sb
}

const opp = { id: 'o1', titre: 'Maison Leroy', etape: 'Devis envoyé', contact_id: 'c1', montant_estime: 1000, probabilite: 50 }

describe('crmDb — affaires en attente', () => {
  it('mise en attente : étape, date, motif, relances soldées, rappel à la date de reprise', async () => {
    const sb = fakeSb()
    const { opp: saved } = await mettreEnAttente(opp, { date_reprise: '2027-04-12', motif_attente: 'Projet reporté' }, sb)
    expect(saved).toMatchObject({ etape: 'En attente', date_reprise: '2027-04-12', motif_attente: 'Projet reporté' })
    const [up, close, ins] = sb.calls
    expect(up).toMatchObject({ table: 'crm_opportunites', op: 'update' })
    expect(close).toMatchObject({ table: 'crm_interactions', op: 'update', row: { action_faite: true } })
    expect(close.filters).toContainEqual(['eq', 'opportunite_id', 'o1'])
    expect(ins).toMatchObject({ table: 'crm_interactions', op: 'insert' })
    expect(ins.row).toMatchObject({
      opportunite_id: 'o1', contact_id: 'c1', sujet: 'Affaire mise en attente : Projet reporté',
      prochaine_action: ACTION_REPRISE, prochaine_action_date: '2027-04-12',
    })
  })

  it('reprise : retour dans le pipeline, colonnes d’attente vidées, rappels de reprise soldés', async () => {
    const sb = fakeSb()
    await reprendreOpportunite({ ...opp, etape: 'En attente', date_reprise: '2027-04-12', motif_attente: 'Projet reporté' }, 'Négociation', {}, sb)
    const [up, close] = sb.calls
    expect(up.row).toMatchObject({ etape: 'Négociation', date_reprise: null, motif_attente: null })
    expect(close.filters).toContainEqual(['ilike', 'prochaine_action', 'Reprendre contact%'])
  })

  it('base sans la migration 043 : colonnes non envoyées hors attente', async () => {
    const sb = fakeSb()
    await upsertOpportunite(opp, sb)
    expect(sb.calls[0].row).not.toHaveProperty('date_reprise')
  })
})
