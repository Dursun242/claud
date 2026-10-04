import { parseAnnuaire, parseBodacc, procedureSeverity, legalStatus, worsened, sirenOfSiret } from '../legalCheck'

const SIREN = '552100554'
const ann = (etat, extra = {}) => ({ results: [{ siren: SIREN, nom_raison_sociale: 'COSTA', etat_administratif: etat, ...extra }] })
const rec = (familleavis, dateparution, jugement, registre = ['552 100 554', SIREN]) => ({ familleavis, dateparution, registre, jugement, tribunal: 'TC Le Havre' })

describe('contrôle légal : lecture des sources', () => {
  it('SIREN depuis le SIRET', () => {
    expect(sirenOfSiret('552 100 554 00013')).toBe(SIREN)
    expect(sirenOfSiret('123')).toBe('')
  })

  it('annuaire : active, fermée, introuvable, illisible', () => {
    expect(parseAnnuaire(ann('A'), SIREN)).toMatchObject({ etat: 'active', nom: 'COSTA' })
    expect(parseAnnuaire(ann('C', { date_fermeture: '2025-06-30' }), SIREN)).toMatchObject({ etat: 'fermee', dateFermeture: '2025-06-30' })
    expect(parseAnnuaire({ results: [{ siren: '999999999', etat_administratif: 'A' }] }, SIREN)).toEqual({ etat: null, introuvable: true })
    expect(parseAnnuaire({ erreur: 1 }, SIREN)).toEqual({ etat: null })
  })

  it('BODACC : dernière procédure collective (jugement en texte JSON ou objet), radiation, autre SIREN ignoré', () => {
    const json = { results: [
      rec('collective', '2024-01-10', JSON.stringify({ nature: 'Jugement d\'ouverture d\'une procédure de redressement judiciaire', date: '2024-01-05' })),
      rec('collective', '2025-03-01', { nature: 'Jugement prononçant la conversion en liquidation judiciaire', date: '2025-02-25' }),
      rec('collective', '2026-01-01', { nature: 'Liquidation judiciaire' }, ['111 222 333']),
      rec('modification', '2025-04-01', null),
    ] }
    const b = parseBodacc(json, SIREN)
    expect(b.procedure).toMatchObject({ nature: 'Jugement prononçant la conversion en liquidation judiciaire', parution: '2025-03-01', severity: 'critique', tribunal: 'TC Le Havre' })
    expect(b.radiation).toBeNull()
    expect(parseBodacc({ results: [rec('radiation', '2025-05-01', null, '552100554')] }, SIREN).radiation).toEqual({ date: '2025-05-01' })
    expect(parseBodacc({ oups: true }, SIREN)).toBeNull()
  })

  it('gravité des jugements', () => {
    expect(procedureSeverity('Jugement d\'ouverture de liquidation judiciaire')).toBe('critique')
    expect(procedureSeverity('Jugement de clôture pour insuffisance d\'actif de la liquidation')).toBe('critique')
    expect(procedureSeverity('Jugement d\'ouverture d\'une procédure de sauvegarde')).toBe('alerte')
    expect(procedureSeverity('Jugement arrêtant le plan de redressement')).toBe('alerte')
    expect(procedureSeverity('Jugement de clôture de la procédure de sauvegarde')).toBe('terminee')
  })
})

describe('contrôle légal : synthèse', () => {
  const liq = { procedure: { nature: 'Liquidation judiciaire', parution: '2025-03-01', severity: 'critique' }, radiation: null }
  it('critique : fermée (annuaire) ou liquidation (BODACC)', () => {
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'fermee', dateFermeture: '2025-06-30' }, bodacc: null }))
      .toMatchObject({ statut: 'critique', libelle: 'Entreprise fermée depuis le 30/06/2025 (annuaire des entreprises)' })
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'active' }, bodacc: liq }))
      .toMatchObject({ statut: 'critique', libelle: 'Liquidation judiciaire (BODACC du 01/03/2025)' })
  })
  it('alerte : redressement en cours ; ok : active sans procédure ; procédure terminée', () => {
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'active' }, bodacc: { procedure: { nature: 'Redressement judiciaire', parution: '2025-01-01', severity: 'alerte' }, radiation: null } }).statut).toBe('alerte')
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'active' }, bodacc: { procedure: null, radiation: null } }))
      .toMatchObject({ statut: 'ok', libelle: 'Entreprise active, aucune procédure collective publiée' })
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'active' }, bodacc: { procedure: { nature: 'Clôture', parution: '2020-01-01', severity: 'terminee' }, radiation: null } }).statut).toBe('ok')
  })
  it('jamais « tout va bien » sans les deux sources', () => {
    expect(legalStatus({ siren: SIREN, annuaire: { etat: 'active' }, bodacc: null }).statut).toBe('inconnu')
    expect(legalStatus({ siren: SIREN, annuaire: null, bodacc: { procedure: null, radiation: null } }).statut).toBe('inconnu')
    expect(legalStatus({ siren: '' }).libelle).toMatch(/Pas de SIRET/)
    expect(legalStatus({ siren: SIREN, annuaire: { etat: null, introuvable: true } }).libelle).toMatch(/introuvable/)
  })
  it('dégradation (pour prévenir l’équipe une seule fois)', () => {
    expect(worsened(undefined, 'critique')).toBe(true)
    expect(worsened('ok', 'alerte')).toBe(true)
    expect(worsened('critique', 'critique')).toBe(false)
    expect(worsened('alerte', 'ok')).toBe(false)
    expect(worsened('ok', 'inconnu')).toBe(false)
  })
})
