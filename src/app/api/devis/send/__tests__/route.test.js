/**
 * @jest-environment node
 */
let POST, verifyStaff, sendMail, createTransport, stored, devisRow, updates

const PDF = Buffer.from('%PDF-1.4 test').toString('base64')

function loadRoute() {
  jest.resetModules()
  sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' })
  createTransport = jest.fn(() => ({ sendMail }))
  jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport } }))
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  stored = {}
  devisRow = null
  updates = []
  const query = () => {
    const b = {
      select: () => b, eq: () => b,
      update: (patch) => { updates.push(patch); return b },
      maybeSingle: async () => ({ data: devisRow, error: null }),
      then: (res) => res({ error: null }),
    }
    return b
  }
  jest.doMock('@/app/lib/supabaseClients', () => ({
    adminClient: () => ({ from: query, storage: { from: () => ({
      download: async (p) => (stored[p]
        ? { data: { type: 'application/pdf', arrayBuffer: async () => stored[p] }, error: null }
        : { data: null, error: { message: 'not found' } }),
    }) } }),
  }))
  POST = require('../route').POST
  verifyStaff = require('@/app/lib/auth').verifyStaff
}

const req = (body) => ({ url: 'https://claud-dusky.vercel.app/api/devis/send', headers: { get: () => '9.9.9.9' }, json: async () => body })
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
      from: 'ID Maîtrise <contact@id-maitrise.com>', to: ['client@exemple.fr'],
      replyTo: 'moe@id-maitrise.com', subject: 'Devis 26-050', text: 'Bonjour',
    })
    expect(mail.bcc).toBeUndefined()
    expect(mail.attachments[0]).toMatchObject({ filename: '26-050.pdf', contentType: 'application/pdf' })
    expect(mail.attachments[0].content.subarray(0, 4).toString()).toBe('%PDF')
    // Copie à l'expéditeur envoyée à part
    const copy = sendMail.mock.calls[1][0]
    expect(copy).toMatchObject({ to: 'moe@id-maitrise.com', subject: '[Copie] Devis 26-050' })
    expect(copy.attachments[0].filename).toBe('26-050.pdf')
  })

  it('suivi des ouvertures : image de suivi dans le mail du client, pas dans la copie', async () => {
    const devisId = '11111111-2222-3333-4444-555555555555'
    devisRow = { id: devisId, track_token: null }
    expect((await POST(req({ ...valid, devisId }))).status).toBe(200)
    const token = updates[0].track_token
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const [client, copy] = sendMail.mock.calls.map(c => c[0])
    expect(client.html).toContain(`src="https://claud-dusky.vercel.app/api/devis/track?t=${token}"`)
    expect(copy.html).not.toContain('/api/devis/track')

    // Jeton existant réutilisé (les anciens mails restent suivis)
    sendMail.mockClear(); updates.length = 0
    devisRow = { id: devisId, track_token: 'c'.repeat(64) }
    await POST(req({ ...valid, devisId, copyMe: false }))
    expect(updates).toHaveLength(0)
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].html).toContain(`track?t=${'c'.repeat(64)}`)
  })

  it('sans devis connu ou sans migration : mail envoyé sans image de suivi', async () => {
    devisRow = null
    await POST(req({ ...valid, devisId: '11111111-2222-3333-4444-555555555555' }))
    expect(sendMail.mock.calls[0][0].html).not.toContain('/api/devis/track')
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

  it('erreur SMTP → 502 avec un message explicite', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }))
    const res = await POST(req(valid))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/mot de passe d’application/)
    sendMail.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    expect((await (await POST(req(valid))).json()).error).toMatch(/injoignable/)
  })

  it('tolère espaces et guillemets saisis dans Vercel', async () => {
    Object.assign(process.env, { SMTP_HOST: ' smtp.gmail.com ', SMTP_PORT: '465', SMTP_PASS: 'abcd efgh ijkl mnop', DEVIS_EMAIL_FROM: '"ID Maîtrise <contact@id-maitrise.com>"' })
    loadRoute()
    verifyStaff.mockResolvedValue({ user: { email: 'moe@id-maitrise.com' }, status: 200 })
    await POST(req(valid))
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'contact@id-maitrise.com', pass: 'abcdefghijklmnop' },
    }))
    expect(sendMail.mock.calls[0][0].from).toBe('ID Maîtrise <contact@id-maitrise.com>')
  })

  it('joint les documents cochés (Kbis, décennale, fichier ajouté) ; refuse un chemin hors dossier', async () => {
    stored['devis-documents/1700000000000__Kbis ID Maîtrise.pdf'] = Buffer.from('%PDF kbis')
    stored['devis-envoi/abc/plan.pdf'] = Buffer.from('%PDF plan')
    const res = await POST(req({ ...valid, attachments: ['devis-documents/1700000000000__Kbis ID Maîtrise.pdf', 'devis-envoi/abc/plan.pdf'] }))
    expect(res.status).toBe(200)
    const files = sendMail.mock.calls[0][0].attachments
    expect(files.map(f => f.filename)).toEqual(['26-050.pdf', 'Kbis ID Maîtrise.pdf', 'plan.pdf', 'logo-id-maitrise.png'])
    expect(files[1].content.toString()).toBe('%PDF kbis')

    expect((await POST(req({ ...valid, attachments: ['devis-signature/x/original-1.pdf'] }))).status).toBe(400)
    expect((await POST(req({ ...valid, attachments: ['devis-envoi/../devis-signature/x.pdf'] }))).status).toBe(400)
    expect((await POST(req({ ...valid, attachments: ['devis-envoi/zzz/absent.pdf'] }))).status).toBe(400)
    expect(sendMail).toHaveBeenCalledTimes(2) // mail + copie à l'expéditeur
  })

  it('version HTML aux couleurs de la société, lien de signature en bouton et en texte', async () => {
    const signUrl = `https://claud-dusky.vercel.app/signer/${'b'.repeat(64)}`
    expect((await POST(req({ ...valid, signUrl }))).status).toBe(200)
    const mail = sendMail.mock.calls[0][0]
    expect(mail.text).toBe(`Bonjour\n\nPour signer ce devis en ligne (bon pour accord) :\n${signUrl}`)
    expect(mail.html).toContain(`href="${signUrl}"`)
    expect(mail.html).toContain('SARL ID MAÎTRISE')
    expect(mail.html).toContain('📎 26-050.pdf')
    // Logo intégré (cid) au corps du mail
    expect(mail.html).toContain('src="cid:logo-id-maitrise"')
    const logo = mail.attachments.find(a => a.cid === 'logo-id-maitrise')
    expect(logo).toMatchObject({ contentType: 'image/png', contentDisposition: 'inline' })
    expect(logo.content.subarray(1, 4).toString()).toBe('PNG')
    expect((await POST(req({ ...valid, signUrl: 'https://evil.test/x' }))).status).toBe(400)
  })
})
