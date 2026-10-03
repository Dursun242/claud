jest.mock('../../supabaseClient', () => ({ supabase: { storage: { from: jest.fn() } } }))
jest.mock('../imageForAI', () => ({ resizeImageForAI: jest.fn(async () => ({ base64: btoa('jpeg'), mediaType: 'image/jpeg' })) }))

// eslint-disable-next-line import/first
import { prepareFile, uploadConformiteDoc } from '../conformiteClient'
// eslint-disable-next-line import/first
import { supabase } from '../../supabaseClient'

describe('dépôt des documents depuis le navigateur', () => {
  it('photo → JPEG réduit ; PDF inchangé', async () => {
    const pdf = new File(['%PDF'], 'kbis.pdf', { type: 'application/pdf' })
    expect(await prepareFile(pdf)).toBe(pdf)
    const photo = await prepareFile(new File(['x'], 'IMG_1.PNG', { type: 'image/png' }))
    expect(photo).toMatchObject({ name: 'IMG_1.jpg', type: 'image/jpeg' })
  })

  it('URL signée → envoi direct au stockage → enregistrement', async () => {
    const uploadToSignedUrl = jest.fn().mockResolvedValue({ error: null })
    supabase.storage.from.mockReturnValue({ uploadToSignedUrl })
    const post = jest.fn()
      .mockResolvedValueOnce({ path: 'conformite/c1/kbis/1__k.pdf', token: 'tok', name: 'k.pdf', type: 'application/pdf' })
      .mockResolvedValueOnce({ id: 'd1' })
    const file = new File(['%PDF'], 'k.pdf', { type: 'application/pdf' })
    const r = await uploadConformiteDoc(post, { kind: 'kbis', file, extra: { contactId: 'c1' } })
    expect(r).toEqual({ id: 'd1' })
    expect(post.mock.calls[0][0]).toEqual({ contactId: 'c1', action: 'prepare', kind: 'kbis', name: 'k.pdf', type: 'application/pdf', size: 4 })
    expect(uploadToSignedUrl).toHaveBeenCalledWith('conformite/c1/kbis/1__k.pdf', 'tok', file, { contentType: 'application/pdf' })
    expect(post.mock.calls[1][0]).toEqual({ contactId: 'c1', action: 'register', kind: 'kbis', path: 'conformite/c1/kbis/1__k.pdf', name: 'k.pdf' })
  })

  it('échec du stockage : message clair, pas d’enregistrement', async () => {
    supabase.storage.from.mockReturnValue({ uploadToSignedUrl: jest.fn().mockResolvedValue({ error: { message: 'trop gros' } }) })
    const post = jest.fn().mockResolvedValueOnce({ path: 'p', token: 't', name: 'k.pdf', type: 'application/pdf' })
    await expect(uploadConformiteDoc(post, { kind: 'kbis', file: new File(['x'], 'k.pdf', { type: 'application/pdf' }) }))
      .rejects.toThrow('Dépôt du fichier impossible : trop gros')
    expect(post).toHaveBeenCalledTimes(1)
  })
})
