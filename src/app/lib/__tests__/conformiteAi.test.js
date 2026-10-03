import { cleanDocRead, docReadPrompt, DOC_READ_SCHEMA } from '../conformiteAi'

const base = {
  type_document: 'decennale', raison_sociale: ' COSTA  PLOMBERIE ', siret: '552 100 554 00013',
  date_document: '2026-01-04', valide_du: '2026-01-01', valide_au: '2026-12-31', assureur: 'SMABTP',
  numero_police: '123', activites: 'Plomberie, chauffage', activite_couverte: 'oui', code_securite: 'X', anomalies: [],
}

describe('lecture IA des documents', () => {
  it('nettoie la réponse (dates, SIRET, champs propres au type)', () => {
    expect(cleanDocRead(base, 'decennale')).toEqual({
      raison_sociale: 'COSTA PLOMBERIE', siret_lu: '55210055400013', date_document: '2026-01-04',
      valide_du: '2026-01-01', valide_au: '2026-12-31', assureur: 'SMABTP', numero_police: '123',
      activites: 'Plomberie, chauffage', code_securite: null, iban: null, bic: null, anomalies: [],
    })
    expect(cleanDocRead({ ...base, type_document: 'rib', iban: 'fr76 3000 6000 0112 3456 7890 189', bic: 'agri frpp xxx' }, 'rib'))
      .toMatchObject({ iban: 'FR7630006000011234567890189', bic: 'AGRIFRPPXXX', assureur: null, anomalies: [] })
    const u = cleanDocRead({ ...base, type_document: 'urssaf', date_document: '04/01/2026', siret: '12' }, 'urssaf')
    expect(u).toMatchObject({ date_document: null, siret_lu: null, assureur: null, code_securite: 'X' })
  })

  it('signale un mauvais type de document et un métier non couvert', () => {
    expect(cleanDocRead({ ...base, type_document: 'kbis' }, 'fiscale').anomalies[0])
      .toBe('Ce document ressemble à : Extrait Kbis, pas à : Attestation de régularité fiscale.')
    expect(cleanDocRead({ ...base, type_document: 'autre' }, 'kbis').anomalies[0]).toMatch(/ne ressemble pas/)
    expect(cleanDocRead({ ...base, activite_couverte: 'non' }, 'decennale').anomalies).toEqual([
      'Le métier de l’entreprise ne semble pas couvert par cette attestation.',
    ])
    expect(cleanDocRead(null, 'kbis').anomalies[0]).toMatch(/ne ressemble pas/)
  })

  it('consigne : document attendu et fiche', () => {
    const p = docReadPrompt('decennale', { nom: 'Costa', siret: '552', specialite: 'Plomberie' })
    expect(p).toContain('Attestation d’assurance décennale')
    expect(p).toContain('Métier : Plomberie')
    expect(DOC_READ_SCHEMA.required).toContain('activite_couverte')
  })
})
