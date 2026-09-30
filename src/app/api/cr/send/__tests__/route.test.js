/**
 * @jest-environment node
 */
let POST, verifyStaff, sendMail, createTransport

const PDF = Buffer.from('%PDF-1.4 cr').toString('base64')

function loadRoute() {
  jest.resetModules()
  sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' })
  createTransport = jest.fn(() => ({ sendMail }))
  jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport } }))
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
}

let ipSeq = 0
const req = (body) => {
  const ip = `10.0.0.${++ipSeq}`
  return { url: 'https://app.test/api/cr/send', headers: { get: () => ip }, json: async () => body }
}
const valid = {
  subject: 'Compte rendu de chantier n°3 — Villa',
  messages: [
    { to: 'martin@ex.fr', text: 'Bonjour Martin,\n\nActions à votre charge : …' },
    { to: 'durand@ex.fr', text: 'Bonjour Durand,' },
  ],
  pdfBase64: `data:application/pdf;filename=x;base64,${PDF}`,
  filename: 'CR-3-Villa.pdf',
}

beforeEach(() => {
  Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_PORT: '465', SMTP_USER: 'contact@id-maitrise.com', SMTP_PASS: 'x' })
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})

describe('/api/cr/send', () => {
  it('un mail par destinataire avec son texte et le PDF, puis copie à l’expéditeur', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: ['martin@ex.fr', 'durand@ex.fr'], failed: [] })
    expect(sendMail).toHaveBeenCalledTimes(3)
    const first = sendMail.mock.calls[0][0]
    expect(first).toMatchObject({ to: 'martin@ex.fr', replyTo: 'moe@id-maitrise.com', subject: valid.subject })
    expect(first.text).toContain('Bonjour Martin')
    expect(first.html).toContain('Bonjour Martin')
    expect(first.attachments[0]).toMatchObject({ filename: 'CR-3-Villa.pdf', contentType: 'application/pdf' })
    expect(sendMail.mock.calls[2][0]).toMatchObject({ to: 'moe@id-maitrise.com', subject: `[Copie] ${valid.subject}` })
    expect(sendMail.mock.calls[2][0].text).toContain('martin@ex.fr, durand@ex.fr')
  })

  it('refuse sans compte staff', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    const res = await POST(req(valid))
    expect(res.status).toBe(403)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('SMTP absent → 503 EMAIL_NOT_CONFIGURED', async () => {
    delete process.env.SMTP_HOST
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('EMAIL_NOT_CONFIGURED')
  })

  it.each([
    [{ messages: [] }, 'Aucun destinataire'],
    [{ messages: [{ to: 'pas-un-mail', text: 'x' }] }, 'Adresse invalide'],
    [{ messages: [{ to: 'a@ex.fr, b@ex.fr', text: 'x' }] }, 'Adresse invalide'],
    [{ messages: [{ to: 'a@ex.fr', text: 'x' }, { to: 'A@ex.fr', text: 'y' }] }, 'Destinataire en double'],
    [{ messages: [{ to: 'a@ex.fr', text: ' ' }] }, 'Message vide'],
    [{ subject: '' }, 'Objet requis'],
    [{ pdfBase64: Buffer.from('pas un pdf').toString('base64') }, 'Pièce jointe invalide'],
  ])('valide la requête (%#)', async (patch, error) => {
    const res = await POST(req({ ...valid, ...patch }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(error)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('échec partiel : les autres destinataires reçoivent le CR', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('refusé'), { responseCode: 550 }))
    const res = await POST(req({ ...valid, copyMe: false }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.sent).toEqual(['durand@ex.fr'])
    expect(json.failed).toEqual([{ to: 'martin@ex.fr', error: expect.stringContaining('Adresse refusée') }])
  })

  it('tout échoue → 502 avec le message SMTP', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('auth'), { code: 'EAUTH' }))
    const res = await POST(req(valid))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('Identifiants refusés')
  })
})
