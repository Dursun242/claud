import { RAISONS, raisonOf, parseReponse, reponseUrl, relanceMailContent, relanceMailText, relanceChoices, reponseInteraction } from '../devisRelance'
import { devisMailHtml } from '../devisMailHtml'

const devis = { id: 'd1', numero: '26-050', objet: 'Extension maison', date_envoi: '2026-09-20' }

describe('relance d’un devis avec choix de réponse', () => {
  it('raisons : codes uniques, « autre » en dernier', () => {
    expect(new Set(RAISONS.map(r => r.code)).size).toBe(RAISONS.length)
    expect(RAISONS[RAISONS.length - 1].code).toBe('autre')
    expect(raisonOf('budget').court).toBe('Budget dépassé')
    expect(raisonOf('inconnu')).toBeNull()
  })

  it('validation de la réponse du client', () => {
    expect(parseReponse({ raison: 'budget', commentaire: '  autour de 4 000 €  ' })).toEqual({ raison: 'budget', commentaire: 'autour de 4 000 €' })
    expect(parseReponse({ raison: 'xx' }).error).toBe('Choisissez une réponse.')
    expect(parseReponse({ raison: 'autre', commentaire: ' ' }).error).toMatch(/Précisez/)
    expect(parseReponse({ raison: 'autre', commentaire: 'x'.repeat(2000) }).commentaire).toHaveLength(1000)
  })

  it('texte proposé et version texte du mail (lien + liste numérotée)', () => {
    const c = relanceMailContent(devis, { nom: 'M. Martin', email: 'm@x.fr' }, { nom: 'SARL ID MAÎTRISE', gerant: 'Dursun' })
    expect(c.to).toBe('m@x.fr')
    expect(c.subject).toBe('Votre devis 26-050 : un petit retour ?')
    expect(c.intro).toContain('Bonjour M. Martin,')
    expect(c.intro).toContain('du devis 26-050 que nous vous avons adressé le 20/09/2026 pour « Extension maison »')
    expect(c.outro).toMatch(/Dursun — SARL ID MAÎTRISE$/)
    const link = reponseUrl('https://app.test/', 'a'.repeat(64))
    expect(link).toBe(`https://app.test/reponse/${'a'.repeat(64)}`)
    const t = relanceMailText({ intro: c.intro, outro: c.outro, link })
    expect(t).toContain(`Pour nous répondre en un clic, ouvrez ce lien et choisissez votre réponse :\n${link}`)
    expect(t).toContain('1. Le montant dépasse le budget que j’avais prévu')
    expect(t).toContain('10. Autre : …')
    expect(t.indexOf('10. Autre')).toBeLessThan(t.indexOf('Bien cordialement'))
  })

  it('version HTML : un bouton par choix, raison dans le lien', () => {
    const choices = relanceChoices('https://app.test', 'a'.repeat(64))
    expect(choices[0]).toEqual({ label: '1. Le montant dépasse le budget que j’avais prévu', url: `https://app.test/reponse/${'a'.repeat(64)}?r=budget` })
    const html = devisMailHtml({ body: 'Bonjour', bodyAfter: 'Cordialement', choices, choicesTitle: 'Cliquez', company: {} })
    expect(html.match(/\/reponse\/a{64}\?r=/g)).toHaveLength(RAISONS.length)
    expect(html).toContain('10. Autre (précisez)')
    expect(html.indexOf('Cliquez')).toBeLessThan(html.indexOf('Cordialement'))
  })

  it('suite donnée dans le CRM selon la raison', () => {
    expect(reponseInteraction({ devis, raison: 'reporte', commentaire: 'au printemps', today: '2026-10-05' })).toEqual({
      type: 'Email', sujet: 'Réponse du client au devis 26-050 : Projet reporté', contenu: '« au printemps »',
      prochaine_action: 'Reprendre contact (projet reporté)', prochaine_action_date: '2026-12-04',
    })
    expect(reponseInteraction({ devis, raison: 'concurrent', today: '2026-10-05' })).toMatchObject({
      contenu: null, prochaine_action: 'Classer l’affaire perdue', prochaine_action_date: '2026-10-05',
    })
  })
})
