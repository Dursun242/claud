import { buildPriorities, prioritiesDigest, hashText, fmtEuros, fmtHeure } from '../priorities'
import { buildAgenda } from '../today'
import { buildCrmInsights } from '../crmInsights'

const TODAY = '2026-09-22'

const data = {
  chantiers: [{ id: 'ch1', nom: 'Maison Dupont' }],
  tasks: [
    { id: 't1', titre: 'Relancer plombier', statut: 'En cours', echeance: '2026-09-18', priorite: 'Normale', chantierId: 'ch1' },
    { id: 't2', titre: 'Étayer le plancher', statut: 'En cours', echeance: '2026-09-21', priorite: 'Urgent', chantierId: 'ch1' },
    { id: 't3', titre: 'Commander carrelage', statut: 'Planifié', echeance: TODAY },
    { id: 't4', titre: 'Déjà fait', statut: 'Terminé', echeance: '2026-09-01' },
  ],
  rdv: [{ id: 'r1', titre: 'Visite MOA', date: TODAY, heure: '14:00', chantierId: 'ch1' }],
  ordresService: [{ id: 'os1', numero: 'OS-001', artisan_nom: 'Costa', statut_signature: 'Envoyé' }],
  planning: [{ id: 'p3', lot: 'Maçonnerie', debut: '2026-08-01', fin: '2026-09-10', avancement: 60 }],
}
const relances = [{ id: 'i1', title: 'Rappeler M. Martin', sub: 'Extension', date: '2026-09-20', late: true, tab: 'crm', focus: 'o1' }]
const crmItems = [
  { kind: 'chaud', devisId: 'd1', oppId: 'o1', numero: '26-001', montant: 1250, sub: 'Extension', days: 3, event: 'ouverture' },
  { kind: 'chaud', devisId: 'd2', oppId: 'o2', numero: '26-002', montant: 12000, sub: 'Loft', days: 0, event: 'pdf' },
  { kind: 'expire', devisId: 'd3', oppId: 'o3', numero: '26-003', montant: 3000, sub: 'Toiture', days: 1 },
  { kind: 'dormante', devisId: null, oppId: 'o4', montant: 0, sub: 'Garage · Leroy', days: 30 },
]
const agenda = buildAgenda(data, { today: TODAY, relances })

describe('buildPriorities', () => {
  it('classe chantier et commercial ensemble, du plus urgent au moins urgent', () => {
    const r = buildPriorities({ agenda, crmItems, today: TODAY, limit: 3 })
    const ids = [...r.top, ...r.rest].map(p => p.id)
    expect(ids).toEqual([
      'task:t2', 'rdv:r1', 'task:t1', 'chaud:devis:d2',
      'planning:p3', 'relance:i1', 'expire:devis:d3',
      'task:t3', 'os:os1', 'dormante:opp:o4',
    ])
    expect(r.top.map(p => p.id)).toEqual(['task:t2', 'rdv:r1', 'task:t1'])
    expect(r.total).toBe(10)
    expect(r.rest).toHaveLength(7)
  })

  it('donne la raison en clair et la cible du clic', () => {
    const { top, rest } = buildPriorities({ agenda, crmItems, today: TODAY, limit: 20 })
    const by = Object.fromEntries([...top, ...rest].map(p => [p.id, p]))
    expect(by['task:t2']).toMatchObject({ title: 'Étayer le plancher', reason: "Urgente, en retard d'un jour", tab: 'tasks', focus: 't2', score: 86 })
    expect(by['task:t1'].reason).toBe('En retard de 4 jours')
    expect(by['task:t3'].reason).toBe("À faire aujourd'hui")
    expect(by['rdv:r1']).toMatchObject({ reason: 'Rendez-vous à 14 h', tab: 'planning', focus: null })
    expect(by['relance:i1']).toMatchObject({ reason: 'Relance prévue il y a 2 jours', tab: 'crm', focus: 'o1' })
    expect(by['planning:p3'].reason).toBe('Fin prévue dépassée de 12 jours, avancement 60 %')
    expect(by['os:os1']).toMatchObject({ tab: 'os', focus: 'os1' })
    expect(by['chaud:devis:d2']).toMatchObject({
      title: 'Devis 26-002 · Loft', reason: "Devis de 12 000 € téléchargé aujourd'hui, pas encore signé",
      tab: 'crm', focus: 'o2', amount: 12000,
    })
    expect(by['expire:devis:d3'].reason).toBe('Devis de 3 000 € qui expire demain')
    expect(by['dormante:opp:o4']).toMatchObject({ title: 'Garage · Leroy', reason: 'Aucun échange depuis 30 jours' })
    expect(by['dormante:opp:o4']).not.toHaveProperty('amount')
  })

  it('raisons des autres signaux commerciaux', () => {
    const items = [
      { kind: 'chaud', devisId: 'a', oppId: 'oa', numero: '1', montant: 1250, days: 3, event: 'ouverture' },
      { kind: 'signature', devisId: 'b', oppId: 'ob', numero: '2', montant: 0, days: 5 },
      { kind: 'sans_reponse', devisId: 'c', oppId: 'oc', numero: '3', montant: 800, days: 18 },
      { kind: 'brouillon', devisId: 'd', oppId: null, numero: '4', montant: 0, days: 6 },
    ]
    const { top } = buildPriorities({ agenda: {}, crmItems: items, today: TODAY, limit: 10 })
    expect(top.map(p => p.reason)).toEqual([
      'Devis de 1 250 € ouvert il y a 3 jours, pas encore signé',
      'Signature du devis demandée il y a 5 jours, pas encore signée',
      'Devis de 800 € sans réponse depuis 18 jours',
      'Devis en brouillon depuis 6 jours, pas encore envoyé',
    ])
    expect(top[3]).toMatchObject({ tab: 'crm', focus: null })
  })

  it('le montant pèse sur un devis chaud, avec un plafond', () => {
    const chaud = (id, montant) => ({ kind: 'chaud', devisId: id, oppId: `o-${id}`, numero: id, montant, days: 0 })
    const { top } = buildPriorities({ crmItems: [chaud('petit', 500), chaud('enorme', 900000), chaud('gros', 40000)], today: TODAY })
    expect(top.map(p => [p.id, p.score])).toEqual([
      ['chaud:devis:enorme', 70], ['chaud:devis:gros', 70], ['chaud:devis:petit', 50],
    ])
  })

  it('pas de doublon : même élément ou même affaire une seule fois', () => {
    const dupAgenda = { ...agenda, tasksOverdue: [...agenda.tasksOverdue, agenda.tasksOverdue[0]] }
    const twice = [...crmItems, crmItems[1]]
    const { top, rest } = buildPriorities({ agenda: dupAgenda, crmItems: twice, today: TODAY, limit: 50 })
    const ids = [...top, ...rest].map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    // La relance en retard sur l'affaire o1 couvre le devis chaud d1 (même écran)
    expect(ids).toContain('relance:i1')
    expect(ids).not.toContain('chaud:devis:d1')
  })

  it('respecte la limite', () => {
    const r = buildPriorities({ agenda, crmItems, today: TODAY, limit: 1 })
    expect(r.top).toHaveLength(1)
    expect(r.rest).toHaveLength(9)
    expect(buildPriorities({ agenda, crmItems, today: TODAY }).top).toHaveLength(3)
  })

  it('liste vide', () => {
    expect(buildPriorities({ agenda: buildAgenda({}, { today: TODAY }), crmItems: [], today: TODAY }))
      .toEqual({ top: [], rest: [], total: 0 })
    expect(buildPriorities()).toEqual({ top: [], rest: [], total: 0 })
  })

  it('tri stable : à score égal, date puis id', () => {
    const late = (id, date) => ({ id, title: id, date, late: true, tab: 'tasks', focus: id })
    const a = { tasksOverdue: [late('b', '2026-09-20'), late('a', '2026-09-20'), late('c', '2026-09-20')] }
    expect(buildPriorities({ agenda: a, today: TODAY }).top.map(p => p.id)).toEqual(['task:a', 'task:b', 'task:c'])
    const ph = (id, fin) => ({ id, title: id, fin, late: true, avancement: 10 })
    // même score (plafond de 20 jours) : la fin la plus ancienne d'abord
    const b = { phases: [ph('x', '2026-08-20'), ph('y', '2026-07-01')] }
    expect(buildPriorities({ agenda: b, today: TODAY }).top.map(p => p.id)).toEqual(['planning:y', 'planning:x'])
  })

  it("écarte un rendez-vous passé depuis plus d'une heure si l'heure est fournie", () => {
    const a = buildAgenda({ rdv: [
      { id: 'tot', titre: 'Matin', date: TODAY, heure: '8:00' },
      { id: 'encours', titre: 'Midi', date: TODAY, heure: '12:30' },
      { id: 'sans', titre: 'Sans heure', date: TODAY },
    ] }, { today: TODAY })
    const ids = buildPriorities({ agenda: a, today: TODAY, now: '13:00' }).top.map(p => p.id)
    expect(ids).toEqual(['rdv:sans', 'rdv:encours'])
    expect(buildPriorities({ agenda: a, today: TODAY }).total).toBe(3)
  })

  it('fonctionne avec les signaux réels de buildCrmInsights', () => {
    const crm = {
      opportunites: [{ id: 'o1', titre: 'Escalier', etape: 'Devis envoyé', contact_id: 'c1' }],
      devis: [{ id: 'd1', numero: '26-050', opportunite_id: 'o1', statut: 'Envoyé', total_ht: 4200, date_envoi: '2026-09-15' }],
      devisEvents: [{ devis_id: 'd1', kind: 'ouverture', created_at: '2026-09-21T09:00:00Z' }],
      interactions: [{ opportunite_id: 'o1', date: '2026-09-15' }],
    }
    const { items } = buildCrmInsights(crm, { today: TODAY, contactsById: new Map([['c1', { nom: 'Cousin' }]]) })
    const { top } = buildPriorities({ crmItems: items, today: TODAY })
    expect(top[0]).toMatchObject({
      kind: 'chaud', title: 'Devis 26-050 · Escalier · Cousin',
      reason: 'Devis de 4 200 € ouvert hier, pas encore signé', focus: 'o1', amount: 4200,
    })
  })
})

describe('outils', () => {
  it('formats', () => {
    expect(fmtEuros(1250)).toBe('1 250 €')
    expect(fmtEuros(1234567.6)).toBe('1 234 568 €')
    expect(fmtHeure('09:30')).toBe('9 h 30')
    expect(fmtHeure('14:00')).toBe('14 h')
    expect(fmtHeure('')).toBe('')
  })

  it('résumé compact pour l’IA et hash stable', () => {
    const top = [{ title: 'A', reason: 'r1' }, { title: 'B', reason: 'r2' }]
    expect(prioritiesDigest(top, 5)).toBe('1. A — r1\n2. B — r2\n(et 3 autres points moins urgents)')
    expect(prioritiesDigest(top, 2)).toBe('1. A — r1\n2. B — r2')
    expect(hashText('abc')).toBe(hashText('abc'))
    expect(hashText('abc')).not.toBe(hashText('abd'))
  })
})
