import { contactVCard, splitName, isCompanyCard, esc, vcardFileName } from '../vcard'

describe('splitName', () => {
  it('civilité + NOM en majuscules + prénom', () => {
    expect(splitName('M. DEBRIS Julien')).toEqual({ prefix: 'M.', family: 'DEBRIS', given: 'Julien' })
    expect(splitName('Mme Anne-Marie LE GALL')).toEqual({ prefix: 'Mme', family: 'LE GALL', given: 'Anne-Marie' })
  })
  it('sans majuscules : dernier mot = nom', () => {
    expect(splitName('Jean Costa')).toEqual({ prefix: '', family: 'Costa', given: 'Jean' })
    expect(splitName('Costa')).toEqual({ prefix: '', family: 'Costa', given: '' })
  })
})

describe('isCompanyCard', () => {
  it('entreprise sans raison sociale à part', () => {
    expect(isCompanyCard({ nom: 'Costa Plomberie', type: 'Artisan' })).toBe(true)
    expect(isCompanyCard({ nom: 'Jean COSTA', type: 'Artisan' })).toBe(false)
    expect(isCompanyCard({ nom: 'Jean Costa', societe: 'Costa Plomberie', type: 'Artisan' })).toBe(false)
    expect(isCompanyCard({ nom: 'Jean Costa', type: 'Client' })).toBe(false)
  })
})

describe('contactVCard', () => {
  it('personne avec société, téléphones, emails, adresse, note', () => {
    const v = contactVCard({
      nom: 'Jean COSTA', societe: 'Costa Plomberie', type: 'Artisan', specialite: 'Plomberie', fonction: 'Gérant',
      tel: '06 00 00 00 01', tel_fixe: '02 35 00 00 00', email: 'contact@costa.fr', email_travaux: 'chantier@costa.fr',
      adresse: '1 rue de Paris', code_postal: '76600', ville: 'Le Havre', site_web: 'costa.fr', siret: '12345678900012',
    })
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(v.endsWith('END:VCARD\r\n')).toBe(true)
    expect(v).toContain('N:COSTA;Jean;;;')
    expect(v).toContain('FN:Jean COSTA')
    expect(v).toContain('ORG:Costa Plomberie')
    expect(v).toContain('TITLE:Gérant')
    expect(v).toContain('TEL;TYPE=CELL,VOICE:06 00 00 00 01')
    expect(v).toContain('TEL;TYPE=WORK,VOICE:02 35 00 00 00')
    expect(v).toContain('EMAIL;TYPE=INTERNET,WORK:contact@costa.fr')
    expect(v).toContain('item1.EMAIL;TYPE=INTERNET:chantier@costa.fr')
    expect(v).toContain('ADR;TYPE=WORK:;;1 rue de Paris;Le Havre;;76600;France')
    expect(v).toContain('URL:https://costa.fr')
    expect(v).toContain('NOTE:Artisan — Plomberie\\nSIRET : 12345678900012')
  })
  it('entreprise : affichée comme une société', () => {
    const v = contactVCard({ nom: 'Costa Plomberie', type: 'Artisan', email: 'a@b.fr', email_travaux: 'A@b.fr' })
    expect(v).toContain('N:;;;;')
    expect(v).toContain('X-ABSHOWAS:COMPANY')
    expect(v).toContain('ORG:Costa Plomberie')
    expect(v).not.toContain('item1.EMAIL')
  })
  it('échappement', () => {
    expect(esc('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })
  it('nom de fichier', () => {
    expect(vcardFileName({ nom: 'Électricité Martin & Fils' })).toBe('Electricite-Martin-Fils.vcf')
    expect(vcardFileName({})).toBe('contact.vcf')
  })
})
