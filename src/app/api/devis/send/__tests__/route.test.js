/**
 * @jest-environment node
 */
let POST, verifyStaff, sendMail, createTransport

const PDF = Buffer.from('%PDF-1.4 test').toString('base64')

function loadRoute() {
  jest.resetModules()
  sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' })
  createTransport = jest.fn(() => ({ sendMail }))
  jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport } }))
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
}

const req = (body) => ({ headers: { get: () => '9.9.9.9' }, json: async () => body })
const valid = { to: 'client@exemple.fr', cc: '', subject: 'Devis 26-050', text: 'Bonjour', pdfBase64: `data:application/pdf;filename=x;base64,${PDF}`, filename: '26-050.pdf' }

beforeEach(() => {
  Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_PORT: '587', SMTP_USER: 'contact@id-maitrise.com', SMTP_PASS: 'x', DEVIS_EMAIL_FROM: 'ID Maîtrise <contact@id-maitrise.com>' })
  loadRoute()
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
})

describe('/api/devis/send', () => {
  it('envoie le mail avec le PDF joint, copie et réponse à l’expéditeur', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.test', port: 587, secure: false }))
    const mail = sendMail.mock.calls[0][0]
    expect(mail).toMatchObject({
      from: 'ID Maîtrise <contact@id-maitrise.com>', to: ['client@exemple.fr'], bcc: 'moe@id-maitrise.com',
      replyTo: 'moe@id-maitrise.com', subject: 'Devis 26-050', text: 'Bonjour',
    })
    expect(mail.attachments[0]).toMatchObject({ filename: '26-050.pdf', contentType: 'application/pdf' })
    expect(mail.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('503 EMAIL_NOT_CONFIGURED sans SMTP', async () => {
    delete process.env.SMTP_HOST
    const res = await POST(req(valid))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('EMAIL_NOT_CONFIGURED')
  })

  it('refuse non-staff, adresses invalides, PDF invalide', async () => {
    verifyStaff.mockResolvedValueOnce({ user: null, status: 403 })
    expect((await POST(req(valid))).status).toBe(403)
    expect((await POST(req({ ...valid, to: 'pas-un-mail' }))).status).toBe(400)
    expect((await POST(req({ ...valid, pdfBase64: Buffer.from('hello').toString('base64') }))).status).toBe(400)
    expect((await POST(req({ ...valid, subject: '' }))).status).toBe(400)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('erreur SMTP → 502', async () => {
    sendMail.mockRejectedValueOnce(new Error('auth failed'))
    expect((await POST(req(valid))).status).toBe(502)
  })
})
