/** @jest-environment node */
import { storageName, docDisplayName, docType, formatError, isDocPath } from '../devisDocuments'

describe('noms de stockage des pièces jointes', () => {
  it('nom sans accent : gardé tel quel ; avec accents : encodé puis décodé', () => {
    expect(storageName('Kbis 2026.pdf')).toBe('Kbis 2026.pdf')
    const key = storageName('Attestation décennale (MIC).pdf')
    expect(key).toMatch(/^u-[A-Za-z0-9_-]+$/)
    expect(docDisplayName(`devis-documents/1700000000000__${key}`)).toBe('Attestation décennale (MIC).pdf')
    expect(docDisplayName(`devis-envoi/abc/${storageName('plan étage — RDC.pdf')}`)).toBe('plan étage — RDC.pdf')
  })
  it('anciens chemins lisibles inchangés', () => {
    expect(docDisplayName('devis-documents/1700000000000__Kbis.pdf')).toBe('Kbis.pdf')
    expect(docDisplayName('devis-documents/1__u-pas*du*base64')).toBe('u-pas*du*base64')
    expect(isDocPath(`devis-documents/1__${storageName('é.pdf')}`)).toBe(true)
  })
  it('type : MIME annoncé ou extension ; HEIC refusé avec un message clair', () => {
    expect(docType('a.pdf', 'application/pdf')).toBe('application/pdf')
    expect(docType('Kbis.PDF', '')).toBe('application/pdf')
    expect(docType('scan.jpeg', 'application/octet-stream')).toBe('image/jpeg')
    expect(docType('x.exe', '')).toBeNull()
    expect(docType('IMG.heic', 'image/heic')).toBeNull()
    expect(formatError('IMG.heic')).toContain('HEIC')
  })
})
