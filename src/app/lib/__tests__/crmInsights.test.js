import { buildCrmInsights } from '../crmInsights'

const today = '2026-10-01'
const opps = [
  { id: 'o1', titre: 'Escalier', etape: 'Devis envoyé', montant_estime: 7800, probabilite: 50, contact_id: 'c1' },
  { id: 'o2', titre: 'RT2012', etape: 'Devis envoyé', montant_estime: 400, probabilite: 50 },
  { id: 'o3', titre: 'Extension', etape: 'Négociation', montant_estime: 30000, probabilite: 70 },
  { id: 'o4', titre: 'Cuisine', etape: 'Qualifié', montant_estime: 5000, probabilite: 30, created_at: '2026-08-01T10:00:00Z' },
  { id: 'o5', titre: 'Garage', etape: 'Gagné', montant_estime: 9000, date_cloture: '2026-09-20' },
  { id: 'o6', titre: 'Terrasse', etape: 'Devis envoyé', montant_estime: 2000, probabilite: 50 },
  { id: 'o7', titre: 'Permis', etape: 'Prospect', montant_estime: 1250, probabilite: 10 },
]
const devis = [
  { id: 'd1', numero: '26-050', statut: 'Envoyé', opportunite_id: 'o1', total_ht: 7800, date_envoi: '2026-09-24' },
  { id: 'd2', numero: 'D-038', statut: 'Envoyé', statut_signature: 'Envoyé', opportunite_id: 'o2', total_ht: 416.67, date_envoi: '2026-09-25' },
  { id: 'd3', numero: 'D-040', statut: 'Envoyé', opportunite_id: 'o3', total_ht: 30000, date_envoi: '2026-09-10', date_validite: '2026-10-05' },
  { id: 'd4', numero: 'D-030', statut: 'Envoyé', opportunite_id: 'o6', total_ht: 2000, date_envoi: '2026-09-01' },
  { id: 'd5', numero: 'D-045', statut: 'Brouillon', opportunite_id: 'o7', total_ht: 1250, updated_at: '2026-09-20T09:00:00Z' },
  { id: 'd6', numero: 'D-020', statut: 'Accepté', opportunite_id: 'o5', total_ht: 9000, date_reponse: '2026-09-20' },
  { id: 'd7', numero: 'D-010', statut: 'Refusé', opportunite_id: null, total_ht: 3000, date_reponse: '2026-08-15' },
  { id: 'd8', numero: 'D-011', statut: 'Accepté', opportunite_id: null, total_ht: 4000, date_reponse: '2026-07-15' },
  { id: 'd9', numero: 'D-099', statut: 'Envoyé', opportunite_id: 'o5', total_ht: 100, date_envoi: '2026-08-01' },
]
const devisEvents = [
  { devis_id: 'd1', kind: 'ouverture', created_at: '2026-09-25T08:00:00Z' },
  { devis_id: 'd1', kind: 'consultation', created_at: '2026-09-30T18:00:00Z' },
  { devis_id: 'd4', kind: 'ouverture', created_at: '2026-09-02T08:00:00Z' },
]
const interactions = [
  { opportunite_id: 'o4', date: '2026-08-20T10:00:00Z' },
  { opportunite_id: 'o7', date: '2026-09-28T10:00:00Z' },
]

describe('buildCrmInsights', () => {
  const r = buildCrmInsights({ opportunites: opps, devis, devisEvents, interactions }, {
    today, contactsById: new Map([['c1', { id: 'c1', nom: 'Cousin Théau' }]]),
  })

  it('chiffres clés', () => {
    expect(r.kpis).toMatchObject({
      affairesActives: 6,
      devisEnAttente: 5,
      signes30j: 1, signes30jHT: 9000,
      tauxSignature: 67,
    })
    expect(r.kpis.devisEnAttenteHT).toBeCloseTo(7800 + 416.67 + 30000 + 2000 + 100)
  })

  it('signaux triés : client intéressé, signature, expiration, sans réponse, brouillon, dormante', () => {
    expect(r.items.map(i => [i.kind, i.devisId || i.oppId])).toEqual([
      ['chaud', 'd1'], ['signature', 'd2'], ['expire', 'd3'], ['sans_reponse', 'd4'], ['brouillon', 'd5'], ['dormante', 'o4'],
    ])
    expect(r.items[0]).toMatchObject({ oppId: 'o1', title: 'Devis 26-050 : devis consulté hier', sub: 'Escalier · Cousin Théau' })
    expect(r.items[2].title).toBe('Devis D-040 expire dans 4 j')
    expect(r.items[3].title).toBe('Devis D-030 sans réponse depuis 30 j')
    expect(r.items[5].title).toBe('Cuisine : aucun échange depuis 42 j')
  })

  it('affaire close ignorée ; CRM vide sans erreur', () => {
    expect(r.items.some(i => i.devisId === 'd9')).toBe(false)
    expect(buildCrmInsights({}, { today })).toEqual({
      kpis: expect.objectContaining({ affairesActives: 0, devisEnAttente: 0, tauxSignature: null }), items: [],
    })
  })
})
