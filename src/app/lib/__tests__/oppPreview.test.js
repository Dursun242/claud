import { buildOppPreviews, relDay, lastActivityByOpp, sortByActivity } from '../oppPreview'

const today = '2026-10-11'
const devis = [
  { id: 'd1', numero: 'D-048', opportunite_id: 'o1', statut: 'Envoyé', date_envoi: '2026-09-28' },
  { id: 'd0', numero: 'D-040', opportunite_id: 'o1', statut: 'Envoyé', date_envoi: '2026-09-01' },
  { id: 'd2', numero: 'D-053', opportunite_id: 'o2', statut: 'Envoyé', date_envoi: '2026-10-01' },
  { id: 'd3', numero: 'D-052', opportunite_id: 'o3', statut: 'Envoyé', date_envoi: '2026-10-02' },
]

describe('buildOppPreviews', () => {
  it('relDay', () => {
    expect(relDay('2026-10-11', today)).toBe("aujourd'hui")
    expect(relDay('2026-10-10T09:00:00Z', today)).toBe('hier')
    expect(relDay('2026-10-08', today)).toBe('il y a 3 j')
    expect(relDay('2026-10-12', today)).toBe('demain')
  })

  it('dernier devis envoyé : ouvert, relancé ou pas encore ouvert', () => {
    const devisEvents = [
      { devis_id: 'd1', kind: 'ouverture', created_at: '2026-10-10T08:00:00Z' },
      { devis_id: 'd1', kind: 'relance', created_at: '2026-10-05T08:00:00Z' },
      { devis_id: 'd2', kind: 'relance', created_at: '2026-10-11T08:00:00Z' },
      // ouverture automatique juste après la relance : ignorée
      { devis_id: 'd2', kind: 'ouverture', detail: { relance: true }, created_at: '2026-10-11T08:00:30Z' },
    ]
    const p = buildOppPreviews({ devis, devisEvents, today })
    expect(p.get('o1').mail).toEqual({ text: 'Mail ouvert hier · relancé il y a 6 j', tone: 'chaud' })
    expect(p.get('o2').mail.text).toBe("Devis D-053 envoyé il y a 10 j, pas encore ouvert · relancé aujourd'hui")
    expect(p.get('o2').mail.tone).toBe('neutre')
    expect(p.get('o3').mail.text).toBe('Devis D-052 envoyé il y a 9 j, pas encore ouvert')
  })

  it('réponse du client à la relance', () => {
    const devisEvents = [{ devis_id: 'd2', kind: 'reponse', detail: { raison: 'reporte' }, created_at: '2026-10-09T10:00:00Z' }]
    expect(buildOppPreviews({ devis, devisEvents, today }).get('o2').mail).toEqual({ text: 'Réponse il y a 2 j : Projet reporté', tone: 'attente' })
  })

  it('prochain rappel, en retard ou à venir ; relances sans objet exclues', () => {
    const interactions = [
      { id: 'i1', opportunite_id: 'o1', prochaine_action: 'Relancer le devis', prochaine_action_date: '2026-10-08', action_faite: false },
      { id: 'i2', opportunite_id: 'o1', prochaine_action: 'Rappeler', prochaine_action_date: '2026-10-20', action_faite: false },
      { id: 'i3', opportunite_id: 'o2', prochaine_action: 'Relancer le devis', prochaine_action_date: '2026-10-12', action_faite: false },
      { id: 'i4', opportunite_id: 'o3', prochaine_action: 'Vieille relance', prochaine_action_date: '2026-10-01', action_faite: false },
    ]
    const p = buildOppPreviews({ devis: [], interactions, pendingIds: new Set(['i1', 'i2', 'i3']), today })
    expect(p.get('o1').rappel).toEqual({ text: 'Relancer le devis · en retard de 3 j', tone: 'retard' })
    expect(p.get('o2').rappel).toEqual({ text: 'Relancer le devis · demain', tone: 'attente' })
    expect(p.get('o3')).toBeUndefined()
  })
})

describe('lastActivityByOpp / sortByActivity', () => {
  const opportunites = [
    { id: 'a', created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z' },
    { id: 'b', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z' },
    { id: 'c', created_at: '2026-09-03T08:00:00Z', updated_at: '2026-09-03T08:00:00Z' },
  ]
  const devis = [{ id: 'd1', opportunite_id: 'a', date_envoi: '2026-09-05' }, { id: 'd2', opportunite_id: 'b' }]

  it('retient la plus récente des actualités : échange, devis, réponse ou consultation du client', () => {
    const act = lastActivityByOpp({
      opportunites, devis,
      interactions: [{ opportunite_id: 'c', date: '2026-10-01T09:00:00Z' }],
      devisEvents: [
        { devis_id: 'd1', kind: 'consultation', created_at: '2026-10-11T10:00:00Z' },
        { devis_id: 'd2', kind: 'reponse', created_at: '2026-10-12T07:00:00Z' },
      ],
    })
    expect(act.get('a')).toBe('2026-10-11T10:00:00Z')
    expect(act.get('b')).toBe('2026-10-12T07:00:00Z')
    expect(act.get('c')).toBe('2026-10-01T09:00:00Z')
    expect(sortByActivity(opportunites, act).map(o => o.id)).toEqual(['b', 'a', 'c'])
  })

  it('les ouvertures automatiques (antivirus) ne comptent pas', () => {
    const act = lastActivityByOpp({
      opportunites, devis,
      devisEvents: [{ devis_id: 'd2', kind: 'ouverture', created_at: '2026-10-12T07:00:00Z', user_agent: 'Barracuda Sentinel' }],
    })
    expect(act.get('b')).toBe('2026-09-02T08:00:00Z')
  })
})
