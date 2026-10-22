import { shareContactCard } from '../shareVCard'

const contact = { id: 'c1', nom: 'M. DEBRIS Julien', type: 'Client', tel: '06 13 33 55 75' }

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:x')
  global.URL.revokeObjectURL = jest.fn()
})

describe('shareContactCard', () => {
  it('partage du téléphone : fichier .vcf de type text/vcard', async () => {
    const nav = { canShare: jest.fn(() => true), share: jest.fn().mockResolvedValue() }
    expect(await shareContactCard(contact, { nav, doc: document })).toBe('shared')
    const { files, title } = nav.share.mock.calls[0][0]
    expect(title).toBe('M. DEBRIS Julien')
    expect(files[0].name).toBe('M-DEBRIS-Julien.vcf')
    expect(files[0].type).toBe('text/vcard')
    expect(files[0].size).toBeGreaterThan(50)
  })

  it('partage annulé : rien d’autre', async () => {
    const nav = { canShare: () => true, share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })) }
    expect(await shareContactCard(contact, { nav, doc: document })).toBe('cancelled')
  })

  it('sans partage de fichiers ou partage refusé : téléchargement du .vcf', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await shareContactCard(contact, { nav: {}, doc: document })).toBe('downloaded')
    const nav = { canShare: () => true, share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) }
    expect(await shareContactCard(contact, { nav, doc: document })).toBe('downloaded')
    expect(click).toHaveBeenCalledTimes(2)
    click.mockRestore()
  })
})
