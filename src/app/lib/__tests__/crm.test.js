import {
  ETAPES, ETAPES_ACTIVES, probaForEtape, nextEtape, groupByEtape,
  pipelineStats, classifyFollowUps, daysSinceLastInteraction,
  validateOpportunite, validateInteraction, opportuniteToChantier,
} from '../crm'

describe('crm — étapes', () => {
  it('ETAPES_ACTIVES exclut Gagné et Perdu', () => {
    expect(ETAPES_ACTIVES).toEqual(['Prospect', 'Qualifié', 'Devis envoyé', 'Négociation'])
    expect(ETAPES).toHaveLength(6)
  })

  it('probaForEtape force 100/0 sur clôture, garde la valeur saisie sinon', () => {
    expect(probaForEtape('Gagné', 40)).toBe(100)
    expect(probaForEtape('Perdu', 40)).toBe(0)
    expect(probaForEtape('Qualifié', 45)).toBe(45)
    expect(probaForEtape('Qualifié', 0)).toBe(30)
    expect(probaForEtape('Négociation', '')).toBe(70)
  })

  it('nextEtape avance dans le flux et s’arrête en Négociation', () => {
    expect(nextEtape('Prospect')).toBe('Qualifié')
    expect(nextEtape('Devis envoyé')).toBe('Négociation')
    expect(nextEtape('Négociation')).toBeNull()
    expect(nextEtape('Gagné')).toBeNull()
  })
})

describe('crm — groupByEtape', () => {
  it('regroupe dans l’ordre canonique et trie par montant décroissant', () => {
    const g = groupByEtape([
      { id: 1, etape: 'Qualifié', montant_estime: 100 },
      { id: 2, etape: 'Qualifié', montant_estime: 500 },
      { id: 3, etape: 'Inconnue', montant_estime: 10 },
    ])
    expect(Object.keys(g)).toEqual(ETAPES)
    expect(g['Qualifié'].map(o => o.id)).toEqual([2, 1])
    expect(g['Prospect'].map(o => o.id)).toEqual([3])
    expect(g['Perdu']).toEqual([])
  })
})

describe('crm — pipelineStats', () => {
  const today = new Date('2026-09-21T10:00:00Z')
  const opps = [
    { etape: 'Prospect',    montant_estime: 10000, probabilite: 10 },
    { etape: 'Négociation', montant_estime: 50000, probabilite: 70 },
    { etape: 'Gagné',       montant_estime: 80000, probabilite: 100, date_cloture: '2026-09-03' },
    { etape: 'Gagné',       montant_estime: 20000, probabilite: 100, date_cloture: '2026-08-28' },
    { etape: 'Perdu',       montant_estime: 30000, probabilite: 0 },
  ]

  it('calcule pipeline actif, pondéré, gagné du mois et taux de conversion', () => {
    const s = pipelineStats(opps, today)
    expect(s.actives).toBe(2)
    expect(s.montantPipeline).toBe(60000)
    expect(s.montantPondere).toBe(1000 + 35000)
    expect(s.gagneesMois).toBe(1)
    expect(s.montantGagneMois).toBe(80000)
    expect(s.tauxConversion).toBe(67)
  })

  it('taux de conversion null sans clôture, tolère les montants absents', () => {
    const s = pipelineStats([{ etape: 'Prospect' }], today)
    expect(s.tauxConversion).toBeNull()
    expect(s.montantPipeline).toBe(0)
  })

  it('retombe sur updated_at pour dater une affaire gagnée sans date_cloture', () => {
    const s = pipelineStats([{ etape: 'Gagné', montant_estime: 5, updated_at: '2026-09-10T08:00:00Z' }], today)
    expect(s.gagneesMois).toBe(1)
  })
})

describe('crm — relances', () => {
  const today = new Date('2026-09-21T10:00:00Z')
  it('classe en retard / aujourd’hui / à venir et ignore les actions faites', () => {
    const r = classifyFollowUps([
      { id: 'a', prochaine_action_date: '2026-09-25' },
      { id: 'b', prochaine_action_date: '2026-09-15' },
      { id: 'c', prochaine_action_date: '2026-09-21' },
      { id: 'd', prochaine_action_date: '2026-09-01', action_faite: true },
      { id: 'e' },
      { id: 'f', prochaine_action_date: '2026-09-10' },
    ], today)
    expect(r.overdue.map(i => i.id)).toEqual(['f', 'b'])
    expect(r.today.map(i => i.id)).toEqual(['c'])
    expect(r.upcoming.map(i => i.id)).toEqual(['a'])
  })

  it('daysSinceLastInteraction : null sans interaction, sinon nombre de jours', () => {
    const opp = { id: 'o1' }
    expect(daysSinceLastInteraction(opp, [], today)).toBeNull()
    const its = [
      { opportunite_id: 'o1', date: '2026-09-01T00:00:00Z' },
      { opportunite_id: 'o1', date: '2026-09-18T00:00:00Z' },
      { opportunite_id: 'o2', date: '2026-09-20T00:00:00Z' },
    ]
    expect(daysSinceLastInteraction(opp, its, today)).toBe(3)
  })
})

describe('crm — validation', () => {
  it('validateOpportunite', () => {
    expect(validateOpportunite({})).toMatch(/titre/)
    expect(validateOpportunite({ titre: 'x', etape: 'Nope' })).toMatch(/Étape/)
    expect(validateOpportunite({ titre: 'x', etape: 'Prospect', montant_estime: -1 })).toMatch(/montant/)
    expect(validateOpportunite({ titre: 'x', etape: 'Prospect', probabilite: 120 })).toMatch(/probabilité/)
    expect(validateOpportunite({ titre: 'x', etape: 'Perdu' })).toMatch(/motif/)
    expect(validateOpportunite({ titre: 'x', etape: 'Prospect', montant_estime: '', probabilite: 20 })).toBe('')
  })

  it('validateInteraction', () => {
    expect(validateInteraction({ type: 'Fax', sujet: 'x' })).toMatch(/Type/)
    expect(validateInteraction({ type: 'Appel' })).toMatch(/sujet/)
    expect(validateInteraction({ type: 'Appel', sujet: 'x', prochaine_action_date: '2026-10-01' })).toMatch(/prochaine action/)
    expect(validateInteraction({ type: 'Appel', sujet: 'x' })).toBe('')
  })
})

describe('crm — opportuniteToChantier', () => {
  it('construit un chantier Planifié avec le budget et le client du contact', () => {
    const ch = opportuniteToChantier(
      { titre: 'Rénovation Dupont', montant_estime: '42000', adresse: '1 rue A', notes: 'RDV ok' },
      { nom: 'Dupont', societe: 'SCI Dupont', adresse: '9 rue B' },
    )
    expect(ch).toMatchObject({
      nom: 'Rénovation Dupont', client: 'SCI Dupont', adresse: '1 rue A',
      statut: 'Planifié', budget: 42000, depenses: 0, lots: [],
    })
    expect(ch.notes_internes).toContain('RDV ok')
  })

  it('sans contact ni adresse : champs vides mais pas undefined', () => {
    const ch = opportuniteToChantier({ titre: 'T' })
    expect(ch.client).toBe('')
    expect(ch.adresse).toBe('')
    expect(ch.budget).toBe(0)
  })
})
