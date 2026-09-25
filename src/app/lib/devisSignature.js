/**
 * Signature électronique intégrée des devis (côté serveur uniquement).
 *
 * - jeton de signature aléatoire (256 bits)
 * - empreinte SHA-256 du PDF d'origine (preuve d'intégrité)
 * - apposition de la signature sur la dernière page du PDF (pdf-lib) :
 *   image de la signature, nom, date/heure, IP, empreinte du document.
 *
 * Testé dans __tests__/devisSignature.test.js.
 */

import crypto from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const newSignToken = () => crypto.randomBytes(32).toString('hex')
export const isSignToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t)
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const MAX_SIGNATURE_BYTES = 300 * 1024

/** Décode une image PNG de signature (dataURL). Lève une erreur si invalide. */
export function decodeSignaturePng(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) throw new Error('Signature manquante')
  const png = Buffer.from(m[1], 'base64')
  if (png.length > MAX_SIGNATURE_BYTES) throw new Error('Signature trop volumineuse')
  if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('Signature invalide')
  return png
}

// Les polices standard PDF (WinAnsi) ne couvrent pas tous les caractères
const winAnsi = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')

const fmtDate = (d) => new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d)

/**
 * Appose la signature sur la dernière page du PDF.
 * Encadré « Bon pour accord » en bas à droite (au-dessus du pied de page).
 * @returns {Promise<Buffer>} PDF signé
 */
export async function stampSignature(pdfBytes, { name, signaturePng, signedAt = new Date(), ip, numero, pdfHash }) {
  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPages()[doc.getPageCount() - 1]
  const { width, height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const img = await doc.embedPng(signaturePng)

  const boxW = Math.min(230, width * 0.4)
  const boxH = 118
  const x = width - boxW - 36
  const y = Math.max(36, height * 0.14)
  const dark = rgb(0.12, 0.23, 0.37)

  page.drawRectangle({ x, y, width: boxW, height: boxH, borderColor: dark, borderWidth: 0.8, color: rgb(1, 1, 1) })
  page.drawText('Bon pour accord - signé électroniquement'.slice(0, 60), { x: x + 8, y: y + boxH - 14, size: 8, font: bold, color: dark })

  const maxW = boxW - 16
  const maxH = 40
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  page.drawImage(img, { x: x + 8, y: y + boxH - 20 - img.height * scale, width: img.width * scale, height: img.height * scale })

  const lines = [
    [winAnsi(name).slice(0, 60), bold, 8.5],
    [`Le ${fmtDate(signedAt)} (heure de Paris)`, font, 7],
    [`Devis ${winAnsi(numero)}${ip ? ` - IP ${winAnsi(ip).slice(0, 45)}` : ''}`, font, 6.5],
    [`Empreinte SHA-256 : ${String(pdfHash || '').slice(0, 32)}`, font, 5.5],
    [`${String(pdfHash || '').slice(32, 64)}`, font, 5.5],
  ]
  let ty = y + 46
  for (const [text, f, size] of lines) {
    if (text) page.drawText(text, { x: x + 8, y: ty, size, font: f, color: rgb(0.2, 0.25, 0.33) })
    ty -= size + 3
  }
  doc.setModificationDate(signedAt)
  return Buffer.from(await doc.save())
}
