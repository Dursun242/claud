/**
 * @jest-environment node
 */
let POST, verifyStaff, sendMail, db, inserts, updates, closeDevisFollowUps

function fakeAdmin() {
  return {
    from(table) {
      const b = {
        select: () => b, eq: () => b,
        update: (patch) => { updates.push({ table, patch }); return b },
        insert: async (row) => { inserts.push({ table, row }); return { error: null } },
        maybeSingle: async () => ({ data: db[table] || null, error: null }),
        then: (res) => res({ error: null }),
      }
      return b
    },
  }
}

const req = (body) => ({ url: 'https://app.test/api/devis/relance', headers: { get: () => '9.9.9.9' }, json: async () => body })
const ID = '11111111-2222-3333-4444-555555555555'
const valid = { devisId: ID, to: 'client@exemple.fr', subject: 'Votre devis 26-050', intro: 'Bonjour,\n\nOù en êtes-vous ?', outro: 'Cordialement' }

beforeEach(() => {
  jest.resetModules()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  sendMail = jest.fn().mockResolvedValue({ messageId: 'm1' })
  jest.doMock('@/app/lib/mailer', () => ({
    smtpConfig: () => ({ transport: {}, from: 'contact@id-maitrise.com', notify: 'contact@id-maitrise.com' }),
    sendMail, smtpErrorMessage: (e) => `Envoi impossible : ${e?.message}`,
  }))
  jest.doMock('@/app/lib/auth', () => ({ verifyStaff: jest.fn() }))
  jest.doMock('@/app/lib/supabaseClients', () => ({ adminClient: () => fakeAdmin() }))
  closeDevisFollowUps = jest.fn().mockResolvedValue(1)
  jest.doMock('@/app/lib/devisWon', () => ({ closeDevisFollowUps }))
  inserts = []; updates = []
  db = {
    crm_devis: { id: ID, numero: '26-050', objet: 'Extension', statut: 'Envoyé', statut_signature: null, opportunite_id: 'o1', track_token: 'c'.repeat(64) },
    crm_opportunites: { contact_id: 'ct1' },
  }
  ;({ POST } = require('../route'))
  verifyStaff = require('@/app/lib/auth').verifyStaff
  verifyStaff.mockResolvedValue({ user: { email: 'moe@id.fr' } })
})

describe('/api/devis/relance', () => {
  it('refuse sans compte équipe', async () => {
    verifyStaff.mockResolvedValue({ user: null, status: 403 })
    expect((await POST(req(valid))).status).toBe(403)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('envoie le mail avec les choix, note la relance et la suivante à J+7', async () => {
    const res = await POST(req(valid))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, suivi: true, to: ['client@exemple.fr'] })
    const mail = sendMail.mock.calls[0][1]
    expect(mail).toMatchObject({ to: ['client@exemple.fr'], replyTo: 'moe@id.fr', subject: 'Votre devis 26-050' })
    expect(mail.text).toContain(`https://app.test/reponse/${'c'.repeat(64)}`)
    expect(mail.text).toContain('1. Le montant dépasse le budget que j’avais prévu')
    expect(mail.html).toContain(`/reponse/${'c'.repeat(64)}?r=concurrent`)
    expect(mail.html).toContain(`/api/devis/track?t=${'c'.repeat(64)}`)
    expect(inserts.find(i => i.table === 'crm_devis_events').row).toMatchObject({ devis_id: ID, kind: 'relance', detail: { to: ['client@exemple.fr'] } })
    expect(closeDevisFollowUps).toHaveBeenCalled()
    const it = inserts.find(i => i.table === 'crm_interactions').row
    expect(it).toMatchObject({ opportunite_id: 'o1', contact_id: 'ct1', sujet: 'Devis 26-050 relancé', prochaine_action: 'Relancer le devis', action_faite: false })
    expect(it.prochaine_action_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('crée le jeton du devis s’il n’existe pas', async () => {
    db.crm_devis.track_token = null
    await POST(req(valid))
    const token = updates.find(u => u.table === 'crm_devis').patch.track_token
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(sendMail.mock.calls[0][1].text).toContain(`/reponse/${token}`)
  })

  it('devis déjà accepté ou signé : pas de relance', async () => {
    db.crm_devis.statut = 'Accepté'
    expect((await POST(req(valid))).status).toBe(409)
    db.crm_devis.statut = 'Envoyé'; db.crm_devis.statut_signature = 'Signé'
    expect((await POST(req(valid))).status).toBe(409)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('contrôles : destinataire, message, devis', async () => {
    expect((await POST(req({ ...valid, to: 'pas-une-adresse' }))).status).toBe(400)
    expect((await POST(req({ ...valid, intro: ' ' }))).status).toBe(400)
    expect((await POST(req({ ...valid, devisId: 'x' }))).status).toBe(400)
    db.crm_devis = null
    expect((await POST(req(valid))).status).toBe(404)
  })
})
