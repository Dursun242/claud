import {
  addMonths, computeValidUntil, docStatus, contactCompliance, identityAnomalies, activeCompanyIds,
  conformiteItems, needsAutoRelance, problemSummary, requestMailText, isSubject, kindsToRequest,
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
    expect(problemSummary(c)).toBe('À fournir : Fiscale et RIB · URSSAF expire dans 5 jours')
    expect(contactCompliance([...docs, doc('fiscale', { valide_au: '2026-09-30' })], TODAY).status).toBe('expire')
  })

  it('RIB : sans date de validité ; IBAN invalide ou différent de la fiche signalé (faux RIB)', () => {
    expect(docStatus(doc('rib', { iban: 'FR7630006000011234567890189' }), TODAY)).toEqual({ status: 'ok', jours: null, valideAu: null })
    expect(docStatus(doc('rib', { anomalies: ['x'] }), TODAY).status).toBe('a_verifier')
    const ok = 'FR7630006000011234567890189'
    expect(identityAnomalies({ iban: ok }, { iban: 'fr76 3000 6000 0112 3456 7890 189' })).toEqual([])
    expect(identityAnomalies({ iban: ok }, {})).toEqual([])
    expect(identityAnomalies({ iban: 'FR7630006000011234567890188' }, {})[0]).toMatch(/IBAN invalide/)
    const autre = 'FR1420041010050500013M02606'
    expect(identityAnomalies({ iban: autre }, { iban: ok })[0])
      .toBe('IBAN différent de celui de la fiche (…2606 au lieu de …0189) : confirmez par téléphone avec l’entreprise avant tout paiement (risque de faux RIB).')
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

  it('priorités : entreprise active fermée ou en liquidation en tête', () => {
    const items = conformiteItems({
      contacts: data.contacts, docs: [], activeIds: activeCompanyIds(data), today: TODAY,
      legalChecks: [{ contact_id: 'c1', statut: 'critique', libelle: 'Liquidation judiciaire (BODACC du 15/09/2026)' }, { contact_id: 'c2', statut: 'critique', libelle: 'x' }],
    })
    expect(items[0]).toMatchObject({ id: 'legal:c1', title: 'Entreprise — Costa Plomberie', reason: 'Liquidation judiciaire (BODACC du 15/09/2026)', score: 95, focus: 'docs:c1' })
    expect(items.map(i => i.id)).not.toContain('legal:c2') // plus sur un chantier en cours
  })

  it('éléments de priorités : seulement les entreprises actives soumises, expiré avant manquant', () => {
    const docs = [
      ...['kbis', 'decennale', 'fiscale'].map(k => doc(k, { valide_au: '2027-06-01' })),
      doc('rib', { iban: 'FR7630006000011234567890189' }),
      doc('urssaf', { valide_au: '2026-09-28' }),
    ]
    const items = conformiteItems({ contacts: data.contacts, docs, activeIds: activeCompanyIds(data), today: TODAY })
    expect(items.map(i => i.id)).toEqual(['conformite:c1', 'conformite:c3'])
    const [c1, c3] = items
    expect(c1).toMatchObject({ kind: 'conformite', tab: 'contacts', focus: 'docs:c1', reason: 'URSSAF expirée depuis 5 jours', score: 63 })
    expect(c3).toMatchObject({ score: 42, reason: 'À fournir : Kbis, Décennale, URSSAF, Fiscale et RIB' })
  })
})

describe('relances automatiques', () => {
  const now = new Date('2026-10-03T08:00:00Z')
  const comp = (docs) => contactCompliance(docs, TODAY)

  const ok = (k) => doc(k, { valide_au: '2027-06-01', iban: k === 'rib' ? 'FR7630006000011234567890189' : undefined })
  const allOk = () => ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(ok)

  it('documents manquants : demande, puis une relance par semaine, sans limite', () => {
    expect(needsAutoRelance({ compliance: comp([]), lastRequest: null, now })).toBe(true)
    expect(needsAutoRelance({ compliance: comp([]), lastRequest: { dernier_envoi: '2026-09-30T08:00:00Z', envois: 1 }, now })).toBe(false)
    expect(needsAutoRelance({ compliance: comp([]), lastRequest: { dernier_envoi: '2026-09-26T08:00:00Z', envois: 9, auto: true }, now })).toBe(true)
  })
  it('document qui expire bientôt', () => {
    const c = comp([...allOk().filter(d => d.kind !== 'urssaf'), doc('urssaf', { valide_au: '2026-10-10' })])
    expect(needsAutoRelance({ compliance: c, lastRequest: null, now })).toBe(true)
  })
  it('document erroné (à renvoyer) : relancé ; à vérifier par l’équipe seulement : non', () => {
    const others = allOk().filter(d => d.kind !== 'kbis' && d.kind !== 'rib')
    const wrong = comp([...others, ok('rib'), doc('kbis', { valide_au: '2027-01-01', anomalies: ['Ce document ressemble à : RIB, pas à : Extrait Kbis.'] })])
    expect(kindsToRequest(wrong)).toEqual(['kbis'])
    expect(needsAutoRelance({ compliance: wrong, lastRequest: null, now })).toBe(true)
    const staff = comp([...others, ok('kbis'), doc('rib', { anomalies: ['IBAN différent de celui de la fiche (…2606 au lieu de …0189) : confirmez par téléphone.'] })])
    expect(staff.status).toBe('a_verifier')
    expect(kindsToRequest(staff)).toEqual([])
    expect(needsAutoRelance({ compliance: staff, lastRequest: null, now })).toBe(false)
    const lecture = comp([...others, ok('rib'), doc('kbis', { anomalies: ['Lecture automatique impossible (x) : saisissez les dates à la main.'] })])
    expect(needsAutoRelance({ compliance: lecture, lastRequest: null, now })).toBe(false)
  })
  it('tout est à jour : rien', () => {
    const all = ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => doc(k, { valide_au: '2027-06-01' }))
    expect(needsAutoRelance({ compliance: comp(all), lastRequest: null, now })).toBe(false)
  })
})

it('mail de demande : documents à fournir et lien', () => {
  const c = contactCompliance([doc('kbis', { valide_au: '2027-01-01' }), doc('urssaf', { valide_au: '2026-09-01' })], TODAY)
  const { subject, text } = requestMailText({ contact: { nom: 'Costa Plomberie' }, compliance: c, link: 'https://app/deposer/abc', expireLe: '2026-11-02T10:00:00Z', company: { nom: 'SARL ID MAÎTRISE' } })
  expect(subject).toBe('Documents administratifs à fournir — SARL ID MAÎTRISE')
  expect(text).toContain('Attestation de vigilance URSSAF de moins de 6 mois. (expiré le 01/09/2026)')
  expect(text).toContain('Attestation d’assurance décennale')
  expect(text).not.toContain('Extrait Kbis de moins de 3 mois')
  expect(text).toContain('https://app/deposer/abc')
  expect(text).toContain('valable jusqu’au 02/11/2026')
  expect(requestMailText({ compliance: c, link: 'x', relance: true }).subject).toMatch(/^Rappel : documents/)
  // Version HTML : bouton à la place de l'adresse
  const m = requestMailText({ contact: { nom: 'Costa Plomberie' }, compliance: c, link: 'https://app/deposer/abc', company: { nom: 'ID' } })
  expect(m.htmlBody).not.toContain('https://app/deposer/abc')
  expect(m.htmlBody).toContain('bouton ci-dessous')
  expect(m.action).toEqual({ url: 'https://app/deposer/abc', label: 'Déposer mes documents', hint: 'Dépôt sécurisé, sans création de compte.' })
  const wrong = contactCompliance([doc('fiscale', { valide_au: '2027-01-01', anomalies: ['Attestation négative : dettes fiscales.'] })], TODAY)
  expect(requestMailText({ compliance: wrong, link: 'x' }).text).toContain('(à renvoyer : Attestation négative : dettes fiscales)')
})

describe('suivi et aperçu des relances', () => {
  // Imports tardifs : mêmes fonctions que l'écran et le cron
  const { planRelances, buildSuivi, nextWeekday, complianceByContact, MAX_RELANCES_PAR_PASSAGE } = require('../conformite')
  const now = new Date('2026-10-03T08:00:00Z') // samedi
  const full = (id) => ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => ({ id: `${id}-${k}`, contact_id: id, kind: k, valide_au: '2027-06-01', anomalies: [], created_at: '2026-09-01' }))
  const contacts = [
    { id: 'a', nom: 'Alpha', type: 'Artisan', email: 'a@x.fr' },
    { id: 'b', nom: 'Bravo', type: 'Artisan', email: 'b@x.fr' },
    { id: 'c', nom: 'Charlie', type: 'Sous-traitant', email: 'c@x.fr' },
    { id: 'd', nom: 'Delta', type: 'Artisan' },
    { id: 'e', nom: 'Echo', type: 'Artisan', email: 'e@x.fr' },
    { id: 'f', nom: 'Fox', type: 'Artisan', email: 'f@x.fr' },
    { id: 'z', nom: 'Client', type: 'Client', email: 'z@x.fr' },
  ]
  const activeIds = new Set(['a', 'b', 'c', 'd', 'e', 'z'])
  const byContact = complianceByContact([...full('c')], TODAY)
  const lastRequest = new Map([
    ['b', { dernier_envoi: '2026-09-20T08:00:00Z', envois: 1 }],
    ['e', { dernier_envoi: '2026-10-01T08:00:00Z', envois: 1 }],
  ])

  it('ordre d’envoi : jamais sollicitées d’abord, puis la demande la plus ancienne ; sans email ni chantier : exclues', () => {
    const plan = planRelances({ contacts, byContact, lastRequest, activeIds, today: TODAY, now })
    expect(plan.map(p => p.contact.id)).toEqual(['a', 'b'])
    expect(plan[0]).toMatchObject({ passage: 0, kinds: ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'] })
  })

  it('15 par passage, le reste aux passages suivants', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, nom: `M${String(i).padStart(2, '0')}`, type: 'Artisan', email: `m${i}@x.fr` }))
    const plan = planRelances({ contacts: many, byContact: new Map(), activeIds: new Set(many.map(m => m.id)), today: TODAY, now })
    expect(MAX_RELANCES_PAR_PASSAGE).toBe(15)
    expect(plan.filter(p => p.passage === 0)).toHaveLength(15)
    expect(plan.filter(p => p.passage === 1)).toHaveLength(5)
  })

  it('suivi : avancement, prochaine relance de chaque entreprise', () => {
    const { stats, rows } = buildSuivi({ contacts, byContact, lastRequest, activeIds, today: TODAY, now })
    expect(stats).toMatchObject({ actives: 5, aJour: 1, docsRecus: 5, docsTotal: 25, sansEmail: 1, prochainPassage: 2, enAttente: 2 })
    const by = Object.fromEntries(rows.map(r => [r.contact.id, r.relance]))
    expect(by.a).toEqual({ kind: 'prevue', passage: 0 })
    expect(by.c).toEqual({ kind: 'a_jour' })
    expect(by.d).toEqual({ kind: 'sans_email' })
    expect(by.e).toEqual({ kind: 'date', date: '2026-10-08' })
    expect(by.f).toEqual({ kind: 'inactive' })
    expect(rows.map(r => r.contact.id)).not.toContain('z')
    expect(rows[rows.length - 1].contact.id).toBe('f')
  })

  it('jour ouvré suivant', () => {
    expect(nextWeekday('2026-10-03')).toBe('2026-10-05')
    expect(nextWeekday('2026-10-04')).toBe('2026-10-05')
    expect(nextWeekday('2026-10-06')).toBe('2026-10-06')
  })
})

describe('suspension des relances', () => {
  const { relancePause, planRelances, buildSuivi, complianceByContact } = require('../conformite')
  const now = new Date('2026-10-03T08:00:00Z')
  const base = { type: 'Artisan', email: 'x@x.fr' }
  const contacts = [
    { ...base, id: 'a', nom: 'A' },
    { ...base, id: 'b', nom: 'B', relances_suspendues: true },
    { ...base, id: 'c', nom: 'C', relances_suspendues: true, relances_reprise_le: '2026-10-20' },
    { ...base, id: 'd', nom: 'D', relances_suspendues: true, relances_reprise_le: '2026-10-01' },
  ]
  const activeIds = new Set(['a', 'b', 'c', 'd'])

  it('pause sans limite, jusqu’à une date, reprise automatique à la date', () => {
    expect(relancePause(contacts[0], TODAY)).toBeNull()
    expect(relancePause(contacts[1], TODAY)).toEqual({ jusquau: null })
    expect(relancePause(contacts[2], TODAY)).toEqual({ jusquau: '2026-10-20' })
    expect(relancePause(contacts[3], TODAY)).toBeNull()
  })

  it('entreprises suspendues ou suspension générale : pas de relance', () => {
    const byContact = complianceByContact([], TODAY)
    expect(planRelances({ contacts, byContact, activeIds, today: TODAY, now }).map(p => p.contact.id)).toEqual(['a', 'd'])
    expect(planRelances({ contacts, byContact, activeIds, today: TODAY, now, globalPause: true })).toEqual([])
    const by = Object.fromEntries(buildSuivi({ contacts, byContact, activeIds, today: TODAY, now }).rows.map(r => [r.contact.id, r.relance]))
    expect(by.b).toEqual({ kind: 'suspendue', jusquau: null })
    expect(by.c).toEqual({ kind: 'suspendue', jusquau: '2026-10-20' })
    const g = Object.fromEntries(buildSuivi({ contacts, byContact, activeIds, today: TODAY, now, globalPause: true }).rows.map(r => [r.contact.id, r.relance]))
    expect(g.a).toEqual({ kind: 'pause_globale' })
    expect(g.b.kind).toBe('suspendue')
  })
})

describe('entreprises suivies : chantier en cours ou demande manuelle', () => {
  const { trackedReason, buildSuivi, planRelances, complianceByContact } = require('../conformite')
  const now = new Date('2026-10-03T08:00:00Z')
  const contacts = [
    { id: 'a', nom: 'Artisan actif', type: 'Artisan', email: 'a@x.fr' },
    { id: 'm', nom: 'Demandé sans chantier', type: 'Artisan', email: 'm@x.fr' },
    { id: 'f', nom: 'Fournisseur demandé', type: 'Fournisseur', email: 'f@x.fr' },
    { id: 'n', nom: 'Artisan non suivi', type: 'Artisan', email: 'n@x.fr' },
    { id: 'i', nom: 'Inactif demandé', type: 'Artisan', email: 'i@x.fr', actif: false },
  ]
  const activeIds = new Set(['a'])
  const lastRequest = new Map([
    ['m', { dernier_envoi: '2026-09-20T08:00:00Z', envois: 1 }],
    ['f', { dernier_envoi: '2026-10-02T08:00:00Z', envois: 1 }],
    ['i', { dernier_envoi: '2026-09-01T08:00:00Z', envois: 1 }],
  ])
  const byContact = complianceByContact([], TODAY)

  it('origine du suivi', () => {
    expect(contacts.map(c => trackedReason(c, activeIds, lastRequest))).toEqual(['chantier', 'demande', 'demande', null, null])
  })

  it('figurent dans le suivi et dans les relances', () => {
    const { rows, stats } = buildSuivi({ contacts, byContact, lastRequest, activeIds, today: TODAY, now })
    const by = Object.fromEntries(rows.map(r => [r.contact.id, r]))
    expect(by.f).toMatchObject({ active: true, origine: 'demande', relance: { kind: 'date', date: '2026-10-09' } })
    expect(by.m).toMatchObject({ active: true, origine: 'demande', relance: { kind: 'prevue', passage: 0 } })
    expect(by.n).toMatchObject({ active: false, relance: { kind: 'inactive' } })
    expect(stats.actives).toBe(3)
    expect(planRelances({ contacts, byContact, lastRequest, activeIds, today: TODAY, now }).map(p => p.contact.id)).toEqual(['a', 'm'])
  })
})

describe('mail à l’équipe à chaque dépôt', () => {
  const { depositMailText, contactCompliance } = require('../conformite')
  const base = { contact_id: 'c1', anomalies: [], created_at: '2026-09-01' }
  it('document lu, points à vérifier, avancement ; dossier complet', () => {
    const docs = [{ ...base, kind: 'kbis', valide_au: '2026-12-01' }, { ...base, kind: 'urssaf', valide_au: '2027-01-01', anomalies: ['Document non signé.'], file_name: 'v.pdf' }]
    const m = depositMailText({ contact: { nom: 'Costa' }, kind: 'urssaf', doc: docs[1], compliance: contactCompliance(docs, TODAY), appUrl: 'https://app' })
    expect(m.subject).toBe('[IDMDOC] 📄 Costa a déposé : Attestation de vigilance URSSAF (à vérifier)')
    expect(m.text).toContain('Costa vient de déposer : Attestation de vigilance URSSAF (v.pdf).')
    expect(m.text).toContain('À vérifier : Document non signé.')
    expect(m.text).toContain('Avancement : 1/5 documents à jour · encore à fournir ou à revoir : Décennale, URSSAF, Fiscale, RIB.')
    expect(m.action).toMatchObject({ url: 'https://app', label: 'Ouvrir l’application' })
    const all = ['kbis', 'decennale', 'urssaf', 'fiscale'].map(k => ({ ...base, kind: k, valide_au: '2027-06-01' })).concat({ ...base, kind: 'rib', iban: 'FR7630006000011234567890189', raison_sociale: 'COSTA' })
    const full = depositMailText({ contact: { nom: 'Costa' }, kind: 'rib', doc: all[4], compliance: contactCompliance(all, TODAY) })
    expect(full.text).toContain('Lecture automatique : IBAN lu : FR76 3000 6000 0112 3456 7890 189 · titulaire : COSTA.')
    expect(full.text).toContain('Avancement : 5/5 documents à jour. Dossier complet.')
  })
})
