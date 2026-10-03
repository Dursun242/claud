import {
  addMonths, computeValidUntil, docStatus, contactCompliance, identityAnomalies, activeCompanyIds,
  conformiteItems, needsAutoRelance, problemSummary, requestMailText, isSubject,
} from '../conformite'

const TODAY = '2026-10-03'
const doc = (kind, fields = {}, created_at = '2026-09-01T10:00:00Z') => ({ id: `${kind}-${created_at}`, contact_id: 'c1', kind, created_at, anomalies: [], ...fields })

describe('règles de validité', () => {
  it('ajoute des mois sans déborder la fin du mois', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-08-15', 6)).toBe('2027-02-15')
  })

  it('Kbis 3 mois, URSSAF et fiscale 6 mois, décennale : date écrite', () => {
    expect(computeValidUntil('kbis', { date_document: '2026-08-10' })).toBe('2026-11-10')
    expect(computeValidUntil('urssaf', { date_document: '2026-08-10' })).toBe('2027-02-10')
    expect(computeValidUntil('fiscale', { date_document: '2026-08-10', valide_au: '2026-12-31' })).toBe('2026-12-31')
    expect(computeValidUntil('decennale', { date_document: '2026-01-05', valide_au: '2026-12-31' })).toBe('2026-12-31')
    expect(computeValidUntil('decennale', { date_document: '2026-01-05' })).toBeNull()
  })

  it('état d’un document : à jour, bientôt, expiré, à vérifier', () => {
    expect(docStatus(null, TODAY).status).toBe('manquant')
    expect(docStatus(doc('kbis', { valide_au: '2026-12-01' }), TODAY)).toMatchObject({ status: 'ok', jours: 59 })
    expect(docStatus(doc('kbis', { valide_au: '2026-10-10' }), TODAY)).toMatchObject({ status: 'bientot', jours: 7 })
    expect(docStatus(doc('decennale', { valide_au: '2026-10-25' }), TODAY).status).toBe('bientot')
    expect(docStatus(doc('urssaf', { valide_au: '2026-10-01' }), TODAY)).toMatchObject({ status: 'expire', jours: -2 })
    expect(docStatus(doc('fiscale', {}), TODAY).status).toBe('a_verifier')
    expect(docStatus(doc('fiscale', { valide_au: '2027-01-01', anomalies: ['illisible'] }), TODAY).status).toBe('a_verifier')
    // Expiré l'emporte sur « à vérifier »
    expect(docStatus(doc('fiscale', { valide_au: '2026-01-01', anomalies: ['x'] }), TODAY).status).toBe('expire')
  })

  it('situation d’une entreprise : dernier document de chaque type, le plus grave l’emporte', () => {
    const docs = [
      doc('kbis', { valide_au: '2026-09-01' }, '2026-06-01T00:00:00Z'),
      doc('kbis', { valide_au: '2026-12-20' }, '2026-09-20T00:00:00Z'),
      doc('decennale', { valide_au: '2026-12-31' }),
      doc('urssaf', { valide_au: '2026-10-08' }),
    ]
    const c = contactCompliance(docs, TODAY)
    expect(c.kinds.kbis.status).toBe('ok')
    expect(c.kinds.urssaf.status).toBe('bientot')
    expect(c.kinds.fiscale.status).toBe('manquant')
    expect(c.status).toBe('manquant')
    expect(problemSummary(c)).toBe('À fournir : Fiscale · URSSAF expire dans 5 jours')
    expect(contactCompliance([...docs, doc('fiscale', { valide_au: '2026-09-30' })], TODAY).status).toBe('expire')
  })

  it('signale un SIREN différent de la fiche', () => {
    expect(identityAnomalies({ siret_lu: '55210055400013' }, { siret: '552 100 554 00021' })).toEqual([])
    expect(identityAnomalies({ siret_lu: '123456789' }, { siret: '55210055400013' })[0]).toMatch(/SIREN du document/)
    expect(identityAnomalies({ siret_lu: null }, { siret: '55210055400013' })).toEqual([])
  })
})

describe('entreprises actives et priorités', () => {
  const data = {
    chantiers: [{ id: 'ch1', statut: 'En cours' }, { id: 'ch2', statut: 'Terminé' }],
    ordresService: [
      { chantier_id: 'ch1', artisan_nom: 'Costa Plomberie', statut: 'Envoyé' },
      { chantier_id: 'ch2', artisan_nom: 'Ancien Maçon', statut: 'Envoyé' },
    ],
    contacts: [
      { id: 'c1', nom: 'Costa Plomberie', type: 'Artisan', specialite: 'Plomberie' },
      { id: 'c2', nom: 'Ancien Maçon', type: 'Artisan' },
      { id: 'c3', nom: 'Élec Pro', type: 'Sous-traitant' },
      { id: 'c4', nom: 'M. Client', type: 'Client' },
    ],
    contactChantiers: [{ contact_id: 'c3', chantier_id: 'ch1' }, { contact_id: 'c4', chantier_id: 'ch1' }],
  }

  it('actives = OS ou rattachement sur un chantier en cours', () => {
    expect([...activeCompanyIds(data)].sort()).toEqual(['c1', 'c3', 'c4'])
    expect(isSubject(data.contacts[3])).toBe(false)
  })

  it('éléments de priorités : seulement les entreprises actives soumises, expiré avant manquant', () => {
    const docs = [
      ...['kbis', 'decennale', 'fiscale'].map(k => doc(k, { valide_au: '2027-06-01' })),
      doc('urssaf', { valide_au: '2026-09-28' }),
    ]
    const items = conformiteItems({ contacts: data.contacts, docs, activeIds: activeCompanyIds(data), today: TODAY })
    expect(items.map(i => i.id)).toEqual(['conformite:c1', 'conformite:c3'])
    const [c1, c3] = items
    expect(c1).toMatchObject({ kind: 'conformite', tab: 'contacts', focus: 'docs:c1', reason: 'URSSAF expirée depuis 5 jours', score: 63 })
    expect(c3).toMatchObject({ score: 42, reason: 'À fournir : Kbis, Décennale, URSSAF et Fiscale' })
  })
})

describe('relances automatiques', () => {
  const now = new Date('2026-10-03T08:00:00Z')
  const comp = (docs) => contactCompliance(docs, TODAY)

  it('jamais de première demande automatique pour des documents jamais fournis', () => {
    expect(needsAutoRelance({ compliance: comp([]), lastRequest: null, now })).toBe(false)
  })
  it('renouvellement d’un document fourni qui expire', () => {
    const c = comp([doc('urssaf', { valide_au: '2026-10-10' })])
    expect(needsAutoRelance({ compliance: c, lastRequest: null, now })).toBe(true)
    expect(needsAutoRelance({ compliance: c, lastRequest: { dernier_envoi: '2026-09-30T08:00:00Z', envois: 1 }, now })).toBe(false)
    expect(needsAutoRelance({ compliance: c, lastRequest: { dernier_envoi: '2026-09-20T08:00:00Z', envois: 1 }, now })).toBe(true)
    expect(needsAutoRelance({ compliance: c, lastRequest: { dernier_envoi: '2026-09-20T08:00:00Z', envois: 4, auto: true }, now })).toBe(false)
  })
  it('documents toujours manquants après une demande', () => {
    expect(needsAutoRelance({ compliance: comp([]), lastRequest: { dernier_envoi: '2026-09-01T08:00:00Z', envois: 1 }, now })).toBe(true)
  })
  it('tout est à jour : rien', () => {
    const all = ['kbis', 'decennale', 'urssaf', 'fiscale'].map(k => doc(k, { valide_au: '2027-06-01' }))
    expect(needsAutoRelance({ compliance: comp(all), lastRequest: null, now })).toBe(false)
  })
})

it('mail de demande : documents à fournir et lien', () => {
  const c = contactCompliance([doc('kbis', { valide_au: '2027-01-01' }), doc('urssaf', { valide_au: '2026-09-01' })], TODAY)
  const { subject, text } = requestMailText({ contact: { nom: 'Costa Plomberie' }, compliance: c, link: 'https://app/deposer/abc', expireLe: '2026-11-02T10:00:00Z', company: { nom: 'SARL ID MAÎTRISE' } })
  expect(subject).toBe('documents administratifs à fournir — SARL ID MAÎTRISE')
  expect(text).toContain('Attestation de vigilance URSSAF de moins de 6 mois. (expiré le 01/09/2026)')
  expect(text).toContain('Attestation d’assurance décennale')
  expect(text).not.toContain('Extrait Kbis de moins de 3 mois')
  expect(text).toContain('https://app/deposer/abc')
  expect(text).toContain('valable jusqu’au 02/11/2026')
  expect(requestMailText({ compliance: c, link: 'x', relance: true }).subject).toMatch(/^Rappel/)
})
