/**
 * @jest-environment node
 */
import { summarizeDevisEvents, recordDevisEvent, isTrackToken } from '../devisTracking'

describe('devisTracking', () => {
  it('résume ouvertures et consultations par devis (plus récentes d’abord)', () => {
    const s = summarizeDevisEvents([
      { devis_id: 'd1', kind: 'ouverture', created_at: '2026-09-29T08:00:00Z' },
      { devis_id: 'd1', kind: 'ouverture', created_at: '2026-09-29T10:00:00Z' },
      { devis_id: 'd1', kind: 'pdf', created_at: '2026-09-29T10:05:00Z' },
      { devis_id: 'd2', kind: 'consultation', created_at: '2026-09-28T09:00:00Z' },
    ])
    expect(s.d1).toMatchObject({ ouvertures: 2, consultations: 1, derniereOuverture: '2026-09-29T10:00:00Z', derniereConsultation: '2026-09-29T10:05:00Z' })
    expect(s.d1.events.map(e => e.kind)).toEqual(['pdf', 'ouverture', 'ouverture'])
    expect(s.d2).toMatchObject({ ouvertures: 0, consultations: 1 })
  })

  it('enregistre un événement, sauf répétition rapprochée ; jamais d’exception', async () => {
    const inserts = []
    let recent = []
    const admin = { from: () => {
      const b = { select: () => b, eq: () => b, gte: () => b, limit: async () => ({ data: recent }), insert: async (row) => { inserts.push(row); return { error: null } } }
      return b
    } }
    expect(await recordDevisEvent(admin, 'd1', 'ouverture', { ip: '1.2.3.4', userAgent: 'Gmail' })).toBe(true)
    expect(inserts[0]).toEqual({ devis_id: 'd1', kind: 'ouverture', ip: '1.2.3.4', user_agent: 'Gmail' })
    recent = [{ id: 'e1' }]
    expect(await recordDevisEvent(admin, 'd1', 'ouverture')).toBe(false)
    expect(await recordDevisEvent(admin, 'd1', 'autre')).toBe(false)
    expect(await recordDevisEvent({ from: () => { throw new Error('boom') } }, 'd1', 'pdf')).toBe(false)
    expect(inserts).toHaveLength(1)
  })

  it('jeton de suivi : 64 hexadécimaux', () => {
    expect(isTrackToken('a'.repeat(64))).toBe(true)
    expect(isTrackToken('xyz')).toBe(false)
  })
})

describe('relances et réponses du client (migration 041)', () => {
  const { summarizeDevisEvents } = require('../devisTracking')
  it('compte les relances et garde les réponses, sans les compter comme consultations', () => {
    const s = summarizeDevisEvents([
      { devis_id: 'd1', kind: 'relance', created_at: '2026-10-01T08:00:00Z', detail: { to: ['a@x.fr'] } },
      { devis_id: 'd1', kind: 'reponse', created_at: '2026-10-02T08:00:00Z', detail: { raison: 'budget', commentaire: '' } },
      { devis_id: 'd1', kind: 'reponse', created_at: '2026-10-03T08:00:00Z', detail: { raison: 'rdv', commentaire: 'mardi ?' } },
      { devis_id: 'd1', kind: 'relance', created_at: '2026-10-04T08:00:00Z' },
    ]).d1
    expect(s).toMatchObject({ relances: 2, derniereRelance: '2026-10-04T08:00:00Z', consultations: 0, ouvertures: 0 })
    expect(s.reponses).toEqual([
      { raison: 'rdv', commentaire: 'mardi ?', created_at: '2026-10-03T08:00:00Z' },
      { raison: 'budget', commentaire: '', created_at: '2026-10-02T08:00:00Z' },
    ])
  })
})

describe('ouverture du mail de relance', () => {
  const { summarizeDevisEvents } = require('../devisTracking')
  it('comptée à part des ouvertures du premier mail', () => {
    const s = summarizeDevisEvents([
      { devis_id: 'd1', kind: 'ouverture', created_at: '2026-10-01T08:00:00Z' },
      { devis_id: 'd1', kind: 'relance', created_at: '2026-10-05T19:50:00Z' },
      { devis_id: 'd1', kind: 'ouverture', created_at: '2026-10-06T06:12:00Z', detail: { relance: true } },
    ]).d1
    expect(s).toMatchObject({ ouvertures: 1, derniereOuverture: '2026-10-01T08:00:00Z', relanceOuvertures: 1, derniereRelanceOuverture: '2026-10-06T06:12:00Z' })
    expect(s.events[0]).toEqual({ kind: 'ouverture', created_at: '2026-10-06T06:12:00Z', relance: true })
  })
})
