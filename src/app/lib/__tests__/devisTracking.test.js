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
