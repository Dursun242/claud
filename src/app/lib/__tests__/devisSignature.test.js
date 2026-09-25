/**
 * @jest-environment node
 */
import { PDFDocument } from 'pdf-lib'
import { newSignToken, isSignToken, sha256, decodeSignaturePng, stampSignature } from '../devisSignature'

// PNG 1×1 transparent
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('devisSignature', () => {
  it('jeton aléatoire de 256 bits, reconnu par isSignToken', () => {
    const t = newSignToken()
    expect(t).toMatch(/^[a-f0-9]{64}$/)
    expect(newSignToken()).not.toBe(t)
    expect(isSignToken(t)).toBe(true)
    expect(isSignToken('abc')).toBe(false)
    expect(isSignToken(`${t}'--`)).toBe(false)
  })

  it('refuse une signature absente ou qui n’est pas un PNG', () => {
    expect(() => decodeSignaturePng('')).toThrow('Signature manquante')
    expect(() => decodeSignaturePng('data:image/png;base64,' + Buffer.from('GIF89a').toString('base64'))).toThrow('Signature invalide')
    expect(decodeSignaturePng(PNG).subarray(1, 4).toString()).toBe('PNG')
  })

  it('appose la signature sur la dernière page sans ajouter de page', async () => {
    const src = await PDFDocument.create()
    src.addPage([595, 842]); src.addPage([595, 842])
    const original = Buffer.from(await src.save())
    const signed = await stampSignature(original, {
      name: 'Dursun OZKAN — « test »', signaturePng: decodeSignaturePng(PNG), numero: 'D-2026-032',
      ip: '1.2.3.4', pdfHash: sha256(original), signedAt: new Date('2026-09-25T18:00:00Z'),
    })
    expect(signed.subarray(0, 4).toString()).toBe('%PDF')
    const doc = await PDFDocument.load(signed)
    expect(doc.getPageCount()).toBe(2)
    expect(sha256(signed)).not.toBe(sha256(original))
  })
})
