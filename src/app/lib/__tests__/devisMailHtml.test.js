import { devisMailHtml, textToHtml, isSignUrl, escapeHtml } from '../devisMailHtml'
import { COMPANY } from '../company'

const SIGN = `https://claud-dusky.vercel.app/signer/${'a1'.repeat(32)}`

describe('devisMailHtml', () => {
  it('message en paragraphes, bouton de signature, pièces jointes et pied de page', () => {
    const html = devisMailHtml({
      body: 'Bonjour Mme Martin,\n\nVeuillez trouver ci-joint notre devis.\nIl est valable 30 jours.\n\nCordialement,\nDursun',
      signUrl: SIGN, attachments: ['Devis D-1.pdf', 'Kbis.pdf'], company: COMPANY, title: 'Devis D-1',
    })
    expect(html).toContain('<p style="margin:0 0 14px;">Bonjour Mme Martin,</p>')
    expect(html).toContain('Veuillez trouver ci-joint notre devis.<br>Il est valable 30 jours.')
    expect(html).toContain(`href="${SIGN}"`)
    expect(html).toContain('Consulter et signer le devis')
    expect(html).toContain('📎 Kbis.pdf')
    expect(html).toContain('SIRET 921 536 181 00024')
    expect(html).toContain('ID MAÎTRISE')
  })

  it('sans lien de signature valide : pas de bouton ; pas de section pièces jointes si vide', () => {
    const html = devisMailHtml({ body: 'Bonjour', signUrl: 'https://evil.test/phish', company: COMPANY })
    expect(html).not.toContain('Consulter et signer')
    expect(html).not.toContain('Pièces jointes')
  })

  it('échappe le HTML saisi et rend les liens cliquables', () => {
    expect(textToHtml('<b>x</b> & voir https://id-maitrise.com/devis.')).toBe(
      '<p style="margin:0 0 14px;">&lt;b&gt;x&lt;/b&gt; &amp; voir <a href="https://id-maitrise.com/devis" style="color:#1E3A5F;">https://id-maitrise.com/devis</a>.</p>')
    expect(escapeHtml('"a"')).toBe('&quot;a&quot;')
  })

  it('isSignUrl : uniquement /signer/<jeton de 64 hex>', () => {
    expect(isSignUrl(SIGN)).toBe(true)
    expect(isSignUrl('http://localhost:3000/signer/' + 'f'.repeat(64))).toBe(true)
    expect(isSignUrl('https://x.test/signer/abc')).toBe(false)
    expect(isSignUrl('javascript:alert(1)//signer/' + 'f'.repeat(64))).toBe(false)
  })

  it('en-tête : logo si fourni, sinon nom de la société en texte', () => {
    const withLogo = devisMailHtml({ body: 'x', company: COMPANY, logoSrc: 'cid:logo-id-maitrise' })
    expect(withLogo).toContain('<img src="cid:logo-id-maitrise"')
    expect(withLogo).toContain('alt="SARL ID MAÎTRISE"')
    expect(devisMailHtml({ body: 'x', company: COMPANY })).not.toContain('<img')
  })
})
