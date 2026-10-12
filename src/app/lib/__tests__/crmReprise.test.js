import {
  dueReprises, repriseEnvoyee, repriseSuite, parseReprise, repriseMailContent, repriseMailText, repriseChoices, CHOIX_REPRISE,
} from '../crmReprise'

const contacts = new Map([['c1', { id: 'c1', nom: 'M. Leroy', email: 'leroy@ex.fr' }], ['c2', { id: 'c2', nom: 'Sans mail' }]])
const base = { etape: 'En attente', contact_id: 'c1', date_reprise: '2026-10-12', reprise_auto: true, reprise_envoyee_le: null }

describe('crmReprise — affaires à relancer', () => {
  it('en attente, date atteinte, pas encore relancée, contact avec email', () => {
    const due = dueReprises([
      { ...base, id: 'a' },
      { ...base, id: 'b', date_reprise: '2026-10-13' },                 // pas encore
      { ...base, id: 'c', reprise_auto: false },                        // désactivée
      { ...base, id: 'd', contact_id: 'c2' },                           // pas d'email
      { ...base, id: 'e', reprise_envoyee_le: '2026-10-12' },           // déjà relancée
      { ...base, id: 'f', etape: 'Négociation' },                       // plus en attente
      { ...base, id: 'g', date_reprise: '2026-09-01', reprise_envoyee_le: '2026-03-01' }, // nouvelle date depuis le dernier mail
    ], contacts, '2026-10-12')
    expect(due.map(d => d.opp.id)).toEqual(['g', 'a'])
    expect(due[0].contact.email).toBe('leroy@ex.fr')
  })

  it('repriseEnvoyee : mail parti pour la date de reprise actuelle', () => {
    expect(repriseEnvoyee({ date_reprise: '2026-10-12', reprise_envoyee_le: '2026-10-12' })).toBe(true)
    expect(repriseEnvoyee({ date_reprise: '2027-01-12', reprise_envoyee_le: '2026-10-12' })).toBe(false)
    expect(repriseEnvoyee({ date_reprise: '2026-10-12' })).toBe(false)
  })
})

describe('crmReprise — mail', () => {
  it('rappelle le motif de la pause et liste les choix', () => {
    const c = repriseMailContent({ opp: { motif_attente: 'Attente du financement' }, contact: { nom: 'M. Leroy' }, company: { nom: 'ID Maîtrise' } })
    expect(c.subject).toBe('Où en est votre projet ?')
    expect(c.intro).toContain('Bonjour M. Leroy,')
    expect(c.intro).toContain('en pause (attente du financement)')
    const text = repriseMailText({ ...c, link: 'https://app.test/reprise/abc' })
    expect(text).toContain('https://app.test/reprise/abc')
    expect(text).toContain('1. Mon projet redémarre')
    expect(text).toContain(`${CHOIX_REPRISE.length}. Autre : …`)
    expect(repriseChoices('https://app.test/', 'abc')[1].url).toBe('https://app.test/reprise/abc?r=pause3')
  })
})

describe('crmReprise — réponse du client', () => {
  it('validation', () => {
    expect(parseReprise({ choix: 'x' }).error).toBeTruthy()
    expect(parseReprise({ choix: 'autre', commentaire: '' }).error).toMatch(/Précisez/)
    expect(parseReprise({ choix: 'pause6', commentaire: '  ok ' })).toEqual({ choix: 'pause6', commentaire: 'ok' })
  })

  const opp = { etape: 'En attente', date_reprise: '2026-10-12' }
  it('le projet redémarre : retour dans le pipeline, rappel le jour même', () => {
    const s = repriseSuite({ opp, choix: 'redemarre', aDesDevis: true, today: '2026-10-12' })
    expect(s.patch).toEqual({ etape: 'Négociation', date_reprise: null, motif_attente: null })
    expect(s.interaction).toMatchObject({ prochaine_action_date: '2026-10-12', sujet: 'Réponse du client à la reprise de contact : Le projet redémarre' })
    expect(repriseSuite({ opp, choix: 'redemarre', aDesDevis: false, today: '2026-10-12' }).patch.etape).toBe('Qualifié')
  })

  it('toujours en pause : nouvelle date de reprise', () => {
    const s = repriseSuite({ opp, choix: 'pause6', today: '2026-10-12' })
    expect(s.patch).toEqual({ date_reprise: '2027-04-12' })
    expect(s.interaction.prochaine_action_date).toBe('2027-04-12')
  })

  it('abandon : affaire perdue, tous les rappels soldés', () => {
    const s = repriseSuite({ opp, choix: 'abandon', today: '2026-10-12' })
    expect(s.patch).toMatchObject({ etape: 'Perdu', motif_perte: 'Projet abandonné', date_cloture: '2026-10-12' })
    expect(s.closeFollowUps).toBe('tous')
  })

  it('affaire déjà sortie de l’attente : réponse notée sans rien changer', () => {
    const s = repriseSuite({ opp: { etape: 'Négociation' }, choix: 'abandon', today: '2026-10-12' })
    expect(s.patch).toBeNull()
    expect(s.closeFollowUps).toBeNull()
  })
})
