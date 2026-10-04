/**
 * @jest-environment node
 */
import { buildChiffrageWorkbook, xlsxFileName } from '../chiffrageXlsx'
import { normalizeLots } from '../chiffrage'

const C = {
  reference: 'DPGF-2026-030', indice: 'A', surface_m2: 167.2, surface_annexes: 34.2, tva_pct: 20, aleas_pct: 0,
  description: 'Maison R+1 toit terrasse', observations: 'Sous réserve étude de sol G2.\nNon compris : piscine.',
  lots: normalizeLots([
    { nom: "Honoraires maîtrise d'œuvre", honoraires: true, postes: [{ designation: 'Phase 1', quantite: 4, unite: 'mois', pu_ht: 2300 }] },
    { nom: 'Gros œuvre, maçonnerie', postes: [
      { designation: 'Plancher bas', quantite: 130, unite: 'm²', pu_ht: 110 },
      { designation: 'Escalier béton', quantite: 1, unite: 'Ft', pu_ht: 2200 },
    ] },
  ]),
}
const CH = { nom: 'Maison DONO', client: 'M. Kévin DONO', adresse: '11 rue Mercator' }

describe('export Excel du DPGF (charte ID Maîtrise)', () => {
  it('deux onglets, montants en formules, totaux, ratio, observations', async () => {
    const wb = await buildChiffrageWorkbook(C, CH)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Récapitulatif', 'DPGF'])
    const ws = wb.getWorksheet('DPGF')
    const rows = []
    ws.eachRow((row, n) => rows.push([n, row.values.slice(1).map(v => (v && typeof v === 'object' && 'formula' in v ? `=${v.formula}→${v.result}` : v))]))
    const find = (txt) => rows.find(([, v]) => v.some(x => String(x).includes(txt)))
    const plancher = find('Plancher bas')
    expect(plancher[1]).toEqual(['2.1', 'Plancher bas', 'm²', 130, 110, `=D${plancher[0]}*E${plancher[0]}→14300`])
    expect(find('01')[1].slice(0, 2)).toEqual(['01', "HONORAIRES MAÎTRISE D'ŒUVRE"])
    expect(find('Total lot 02')[1].pop()).toMatch(/^=SUM\(F\d+:F\d+\)→16500$/)
    expect(find('Total travaux HT')[1].pop()).toMatch(/→16500$/)
    expect(find("Honoraires de maîtrise d'œuvre HT")[1].pop()).toMatch(/→9200$/)
    expect(find('TOTAL TTC')[1].pop()).toMatch(/→30840$/)
    expect(find('Ratio TTC')[1].pop()).toMatch(/\/184.3→167$/)
    expect(find('Non compris : piscine.')).toBeTruthy()
    expect(find("LE MAÎTRE D'OUVRAGE")).toBeTruthy()
    expect(ws.getCell(plancher[0], 2).font.name).toBe('Lato')
    const recap = wb.getWorksheet('Récapitulatif')
    const vals = []
    recap.eachRow(row => vals.push(row.values.slice(1)))
    const go = vals.find(v => v[1] === 'GROS ŒUVRE, MAÇONNERIE')
    expect(go[2]).toMatchObject({ formula: expect.stringMatching(/^DPGF!F\d+$/), result: 16500 })
    expect(vals.some(v => v.includes('M. Kévin DONO'))).toBe(true)
    expect(Buffer.from(await wb.xlsx.writeBuffer()).length).toBeGreaterThan(5000)
    expect(xlsxFileName(C, CH)).toBe('DPGF-2026-030 Maison DONO Ind A.xlsx')
  })
})
