// Export Excel (.xlsx) du chiffrage estimatif, à la charte ID Maîtrise :
// noir / blanc / gris comme le logo, police Lato, logo en en-tête, pas
// d'aplat coloré. Deux onglets : Récapitulatif (lots, part %, honoraires,
// HT / TVA / TTC, ratio) et DPGF (N°, désignation, U, Qté, PU HT, Total HT ;
// total par lot ; totaux ; observations ; cadres de signature).
// Montants en formules (Total = Qté × PU, sous-totaux, TVA, TTC) : le
// fichier reste juste si l'on modifie une quantité ou un prix dans Excel.
// exceljs est chargé à la demande (navigateur) : rien au démarrage.

import { COMPANY } from './company'
import { LOGO_B64 } from '../logo'
import { chiffrageTotals, lotTotal, posteTotal, lotNumero, posteNumero, surfaceRef } from './chiffrage'

const NOIR = 'FF1A1A1A'
const GRIS = 'FF6B6B6B'
const FOND = 'FFF2F2F2'
const TRAIT = 'FFD0D0D0'
const EUR = '#,##0.00 "€"'
const font = (o = {}) => ({ name: 'Lato', size: 9, color: { argb: NOIR }, ...o })
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = { style: 'thin', color: { argb: TRAIT } }
const today = () => new Date().toLocaleDateString('fr-FR')

/** Nom de fichier : « DPGF <chantier> Ind A.xlsx ». */
export const xlsxFileName = (c, chantier) =>
  `${c.reference || 'DPGF'} ${chantier?.nom || ''} Ind ${c.indice || 'A'}`.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() + '.xlsx'

function setupSheet(ws, { footer }) {
  ws.views = [{ showGridLines: false }]
  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
  }
  ws.headerFooter = { oddFooter: `&L&"Lato"&8${footer}&R&"Lato"&8Page &P / &N` }
  ws.properties.defaultRowHeight = 15
}

// En-tête commun : logo à gauche, titre à droite, référence, coordonnées
// avec filet noir, bloc maître d'ouvrage / opération. Renvoie la ligne libre.
function header(wb, ws, { logoId, lastCol, c, chantier, title }) {
  ws.addImage(logoId, { tl: { col: 0, row: 0.2 }, ext: { width: 190, height: 50 } })
  ws.getRow(1).height = 22
  ws.getRow(2).height = 18
  ws.getRow(3).height = 18
  const right = (row, value, f) => {
    const cell = ws.getCell(row, lastCol)
    cell.value = value
    cell.font = f
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  right(1, 'DÉCOMPOSITION DU PRIX GLOBAL ET FORFAITAIRE', font({ size: 12, bold: true }))
  right(2, title, font({ size: 10, color: { argb: GRIS } }))
  right(3, `${c.reference || 'DPGF'} · Ind. ${c.indice || 'A'} · ${today()}`, font({ size: 9, color: { argb: GRIS } }))
  const r = 5
  ws.mergeCells(r, 1, r, lastCol)
  const coord = ws.getCell(r, 1)
  coord.value = `${COMPANY.nom} · ${COMPANY.adresse}, ${COMPANY.cpVille} · ${COMPANY.email} · SIRET ${COMPANY.siret}`
  coord.font = font({ size: 8, color: { argb: GRIS } })
  for (let col = 1; col <= lastCol; col++) ws.getCell(r, col).border = { bottom: { style: 'medium', color: { argb: NOIR } } }

  const half = Math.max(1, Math.floor(lastCol / 2))
  const block = (col1, col2, titre, lignes) => {
    ws.mergeCells(7, col1, 7, col2)
    const t = ws.getCell(7, col1)
    t.value = titre
    t.font = font({ size: 8, bold: true, color: { argb: GRIS } })
    // Caractères par ligne ≈ largeur cumulée des colonnes fusionnées
    let width = 0
    for (let col = col1; col <= col2; col++) width += ws.getColumn(col).width || 10
    lignes.forEach((txt, i) => {
      const row = 8 + i
      ws.mergeCells(row, col1, row, col2)
      const cell = ws.getCell(row, col1)
      cell.value = txt
      cell.font = font({ size: i === 0 ? 10 : 9, bold: i === 0 })
      cell.alignment = { wrapText: true, vertical: 'top' }
      const h = 13 * Math.ceil(String(txt).length / (width * 1.1))
      if (h > (ws.getRow(row).height || 15)) ws.getRow(row).height = h
    })
  }
  block(1, half, "MAÎTRE D'OUVRAGE", [chantier?.client || '—'])
  block(half + 1, lastCol, 'OPÉRATION', [chantier?.nom || '', chantier?.adresse || '', c.description || ''].filter(Boolean))
  return 8 + 2 + [chantier?.nom, chantier?.adresse, c.description].filter(Boolean).length
}

export async function buildChiffrageWorkbook(c, chantier) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = COMPANY.nom
  wb.created = new Date()
  const logoId = wb.addImage({ base64: LOGO_B64, extension: 'jpeg' })
  const lots = c.lots || []
  const t = chiffrageTotals(c)
  const ref = surfaceRef(c.surface_m2, c.surface_annexes)
  const footer = `ID Maîtrise · DPGF ${chantier?.client || chantier?.nom || ''} · Indice ${c.indice || 'A'}`
  const tvaPct = Number(c.tva_pct ?? 20)
  const aleasPct = Number(c.aleas_pct) || 0

  // ── Onglet DPGF (construit d'abord : le récapitulatif renvoie à ses cellules)
  const recap = wb.addWorksheet('Récapitulatif')
  const ws = wb.addWorksheet('DPGF')
  for (const s of [recap, ws]) setupSheet(s, { footer })
  ws.columns = [{ width: 7 }, { width: 58 }, { width: 7 }, { width: 9 }, { width: 13 }, { width: 15 }]
  let r = header(wb, ws, { logoId, lastCol: 6, c, chantier, title: 'DPGF détaillé' })
  const head = ws.getRow(r)
  head.values = ['N°', 'Désignation', 'U', 'Qté', 'PU HT', 'Total HT']
  head.eachCell((cell, col) => {
    cell.font = font({ bold: true, size: 8 })
    cell.border = { top: { style: 'thin', color: { argb: NOIR } }, bottom: { style: 'thin', color: { argb: NOIR } } }
    cell.alignment = { horizontal: col >= 3 ? (col === 3 ? 'center' : 'right') : 'left', vertical: 'middle' }
  })
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: r }]
  r += 1
  const lotTotalCell = []
  lots.forEach((l, i) => {
    const lr = ws.getRow(r)
    lr.values = [lotNumero(i), l.nom.toUpperCase()]
    for (let col = 1; col <= 6; col++) {
      const cell = lr.getCell(col)
      cell.fill = fill(FOND)
      cell.font = font({ bold: true })
    }
    r += 1
    const first = r
    l.postes.forEach((p, j) => {
      const row = ws.getRow(r)
      row.values = [posteNumero(i, j), p.designation, p.unite, p.quantite, p.pu_ht]
      row.getCell(6).value = { formula: `D${r}*E${r}`, result: posteTotal(p) }
      row.getCell(1).font = font({ color: { argb: GRIS } })
      row.getCell(1).alignment = { vertical: 'top' }
      row.getCell(2).font = font()
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' }
      row.getCell(3).font = font()
      for (const col of [4, 5, 6]) {
        const cell = row.getCell(col)
        cell.font = font()
        cell.alignment = { horizontal: 'right', vertical: 'top' }
        cell.numFmt = col === 4 ? '#,##0.##' : EUR
      }
      for (let col = 1; col <= 6; col++) row.getCell(col).border = { bottom: thin }
      if (p.designation.length > 75) row.height = 15 * Math.ceil(p.designation.length / 75)
      r += 1
    })
    const tr = ws.getRow(r)
    tr.getCell(2).value = `Total lot ${lotNumero(i)}${l.honoraires ? ' (honoraires)' : ''}`
    tr.getCell(2).alignment = { horizontal: 'right' }
    tr.getCell(6).value = l.postes.length ? { formula: `SUM(F${first}:F${r - 1})`, result: lotTotal(l) } : 0
    tr.getCell(6).numFmt = EUR
    for (const col of [2, 6]) tr.getCell(col).font = font({ bold: true })
    lotTotalCell[i] = `F${r}`
    r += 2
  })

  // Totaux (formules sur les totaux de lots)
  const travauxRefs = lots.map((l, i) => (l.honoraires ? null : lotTotalCell[i])).filter(Boolean)
  const honorRefs = lots.map((l, i) => (l.honoraires ? lotTotalCell[i] : null)).filter(Boolean)
  const sumOf = (refs) => (refs.length ? refs.join('+') : '0')
  const lignes = [['Total travaux HT', sumOf(travauxRefs), t.ht]]
  if (aleasPct) lignes.push([`Aléas ${String(aleasPct).replace('.', ',')} %`, `${sumOf(travauxRefs)}*${aleasPct / 100}`, t.aleas])
  if (honorRefs.length) lignes.push(["Honoraires de maîtrise d'œuvre HT", sumOf(honorRefs), t.honoraires])
  const totStart = r
  lignes.forEach(([lib, f, v]) => {
    const row = ws.getRow(r)
    row.getCell(2).value = lib
    row.getCell(6).value = { formula: f, result: v }
    r += 1
  })
  const totalHtRow = r
  ws.getRow(r).getCell(2).value = 'TOTAL HT'
  ws.getRow(r).getCell(6).value = { formula: `SUM(F${totStart}:F${r - 1})`, result: t.totalHt }
  r += 1
  ws.getRow(r).getCell(2).value = `TVA ${String(tvaPct).replace('.', ',')} %`
  ws.getRow(r).getCell(6).value = { formula: `F${totalHtRow}*${tvaPct / 100}`, result: t.tva }
  r += 1
  const ttcRow = r
  ws.getRow(r).getCell(2).value = 'TOTAL TTC'
  ws.getRow(r).getCell(6).value = { formula: `F${totalHtRow}+F${totalHtRow + 1}`, result: t.ttc }
  for (let k = totStart; k <= ttcRow; k++) {
    const row = ws.getRow(k)
    const strong = k === totalHtRow || k === ttcRow
    row.getCell(2).alignment = { horizontal: 'right' }
    row.getCell(2).font = font({ bold: strong })
    row.getCell(6).font = font({ bold: strong, size: k === ttcRow ? 10 : 9 })
    row.getCell(6).numFmt = EUR
    if (k === ttcRow) for (const col of [2, 3, 4, 5, 6]) row.getCell(col).border = { top: { style: 'thin', color: { argb: NOIR } }, bottom: { style: 'thin', color: { argb: NOIR } } }
  }
  r += 1
  if (ref) {
    ws.getRow(r).getCell(2).value = `Ratio TTC / m²${t.honoraires ? ', MOE comprise' : ''} (SHAB ${c.surface_m2 || 0} m²${Number(c.surface_annexes) ? ` + ½ garage ${c.surface_annexes} m²` : ''} = ${String(ref).replace('.', ',')} m²)`
    ws.getRow(r).getCell(6).value = { formula: `F${ttcRow}/${ref}`, result: t.ratioTtc }
    ws.getRow(r).getCell(2).alignment = { horizontal: 'right' }
    ws.getRow(r).getCell(2).font = font({ color: { argb: GRIS } })
    ws.getRow(r).getCell(6).font = font({ color: { argb: GRIS } })
    ws.getRow(r).getCell(6).numFmt = '#,##0 "€/m²"'
    r += 1
  }

  // Observations
  const obs = String(c.observations || '').split('\n').map(s => s.trim()).filter(Boolean)
  if (obs.length) {
    r += 1
    ws.getRow(r).getCell(1).value = 'OBSERVATIONS'
    ws.getRow(r).getCell(1).font = font({ bold: true, size: 8, color: { argb: GRIS } })
    r += 1
    for (const o of obs) {
      ws.mergeCells(r, 1, r, 6)
      const cell = ws.getCell(r, 1)
      cell.value = `– ${o}`
      cell.font = font({ size: 8.5 })
      cell.alignment = { wrapText: true, vertical: 'top' }
      ws.getRow(r).height = 13 * Math.max(1, Math.ceil(o.length / 105))
      r += 1
    }
  }

  // Cadres de signature
  r += 2
  const sign = (c1, c2, titre, sous) => {
    ws.mergeCells(r, c1, r, c2)
    ws.getCell(r, c1).value = titre
    ws.getCell(r, c1).font = font({ bold: true, size: 8.5 })
    ws.mergeCells(r + 1, c1, r + 1, c2)
    ws.getCell(r + 1, c1).value = sous
    ws.getCell(r + 1, c1).font = font({ size: 8, color: { argb: GRIS } })
    for (let k = r; k <= r + 5; k++) {
      for (let col = c1; col <= c2; col++) {
        ws.getCell(k, col).border = {
          ...(k === r ? { top: thin } : {}), ...(k === r + 5 ? { bottom: thin } : {}),
          ...(col === c1 ? { left: thin } : {}), ...(col === c2 ? { right: thin } : {}),
        }
      }
    }
  }
  sign(1, 2, "LE MAÎTRE D'ŒUVRE", COMPANY.nom)
  sign(3, 6, "LE MAÎTRE D'OUVRAGE", 'Bon pour accord, date et signature')

  // ── Onglet Récapitulatif
  recap.columns = [{ width: 7 }, { width: 46 }, { width: 16 }, { width: 9 }]
  let q = header(wb, recap, { logoId, lastCol: 4, c, chantier, title: 'Récapitulatif par lot' })
  const rh = recap.getRow(q)
  rh.values = ['Lot', 'Désignation', 'Montant HT', 'Part']
  rh.eachCell((cell, col) => {
    cell.font = font({ bold: true, size: 8 })
    cell.border = { top: { style: 'thin', color: { argb: NOIR } }, bottom: { style: 'thin', color: { argb: NOIR } } }
    cell.alignment = { horizontal: col >= 3 ? 'right' : 'left' }
  })
  q += 1
  const firstRecap = q
  lots.forEach((l, i) => {
    const row = recap.getRow(q)
    row.values = [lotNumero(i), l.nom.toUpperCase()]
    row.getCell(3).value = { formula: `DPGF!${lotTotalCell[i]}`, result: lotTotal(l) }
    row.getCell(3).numFmt = EUR
    row.getCell(4).value = { formula: `IF(SUM(C$${firstRecap}:C$${firstRecap + lots.length - 1})=0,0,C${q}/SUM(C$${firstRecap}:C$${firstRecap + lots.length - 1}))`, result: t.totalHt ? lotTotal(l) / (t.honoraires + t.ht) : 0 }
    row.getCell(4).numFmt = '0.0%'
    for (let col = 1; col <= 4; col++) {
      row.getCell(col).font = font({ color: { argb: col === 1 || col === 4 ? GRIS : NOIR } })
      row.getCell(col).border = { bottom: thin }
      if (col >= 3) row.getCell(col).alignment = { horizontal: 'right' }
    }
    q += 1
  })
  q += 1
  const recapTot = [
    ['Total travaux HT', `DPGF!F${totStart}`, t.ht, false],
    ...(aleasPct ? [[`Aléas ${String(aleasPct).replace('.', ',')} %`, `DPGF!F${totStart + 1}`, t.aleas, false]] : []),
    ...(honorRefs.length ? [["Honoraires de maîtrise d'œuvre HT", `DPGF!F${totStart + (aleasPct ? 2 : 1)}`, t.honoraires, false]] : []),
    ['TOTAL HT', `DPGF!F${totalHtRow}`, t.totalHt, true],
    [`TVA ${String(tvaPct).replace('.', ',')} %`, `DPGF!F${totalHtRow + 1}`, t.tva, false],
    ['TOTAL TTC', `DPGF!F${ttcRow}`, t.ttc, true],
  ]
  for (const [lib, f, v, strong] of recapTot) {
    const row = recap.getRow(q)
    row.getCell(2).value = lib
    row.getCell(2).alignment = { horizontal: 'right' }
    row.getCell(2).font = font({ bold: strong })
    row.getCell(3).value = { formula: f, result: v }
    row.getCell(3).numFmt = EUR
    row.getCell(3).font = font({ bold: strong, size: lib === 'TOTAL TTC' ? 10 : 9 })
    if (lib === 'TOTAL TTC') for (const col of [2, 3]) row.getCell(col).border = { top: { style: 'thin', color: { argb: NOIR } }, bottom: { style: 'thin', color: { argb: NOIR } } }
    q += 1
  }
  if (ref) {
    q += 1
    const row = recap.getRow(q)
    row.getCell(2).value = `Ratio TTC / m²${t.honoraires ? ', MOE comprise' : ''} — surface de référence ${String(ref).replace('.', ',')} m² (SHAB + ½ garage)`
    row.getCell(2).alignment = { horizontal: 'right', wrapText: true }
    row.getCell(2).font = font({ color: { argb: GRIS } })
    row.getCell(3).value = { formula: `DPGF!F${ttcRow}/${ref}`, result: t.ratioTtc }
    row.getCell(3).numFmt = '#,##0 "€/m²"'
    row.getCell(3).font = font({ bold: true })
    row.height = 26
  }
  return wb
}

/** Construit le classeur et le télécharge (navigateur). */
export async function downloadChiffrageXlsx(c, chantier) {
  const wb = await buildChiffrageWorkbook(c, chantier)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = xlsxFileName(c, chantier)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
