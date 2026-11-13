/**
 * @jest-environment node
 */
// Génération réelle du PDF et de l'Excel d'un OS (jsPDF / CSV), sans erreur,
// avec des lignes à plusieurs taux (0 % compris) et en TVA non applicable.
jest.mock('../dashboards/shared', () => ({
  SB: { log: jest.fn() },
  COMPANY: jest.requireActual('../lib/company').COMPANY,
}))
jest.mock('../logo', () => ({ LOGO_B64: '' }))

const { generateOSPdf } = require('../generators')

const os = {
  id: 'os', numero: 'OS-2026-015', chantier: 'Maison Friboulet', adresse_chantier: '3 rue du Port, 76600 Le Havre',
  client_nom: 'M. Friboulet', artisan_nom: 'Lefèvre Carrelage', artisan_specialite: 'Carrelage',
  artisan_adresse: '1 rue A, Le Havre', artisan_siret: '12345678900011',
  date_emission: '2026-11-13', date_intervention: '2026-11-16', date_fin_prevue: '2026-11-27',
  statut: 'Brouillon', observations: 'Accès par la cour.', conditions: 'Paiement à 30 jours.',
  prestations: [
    { description: 'Carrelage séjour', unite: 'm²', quantite: '40', prix_unitaire: '45', tva_taux: '20' },
    { description: 'Plinthes', unite: 'ml', quantite: '30', prix_unitaire: '8', tva_taux: '10' },
    { description: 'Évacuation gravats', unite: 'forfait', quantite: '1', prix_unitaire: '150', tva_taux: '0' },
  ],
}

it('OS à plusieurs taux : PDF généré et totaux justes', async () => {
  const out = await generateOSPdf({ ...os, returnBase64: true })
  expect(out.base64).toMatch(/^data:application\/pdf/)
  expect(out).toMatchObject({ totalHT: 2190, totalTVA: 384, totalTTC: 2574 })
})

it('OS en TVA non applicable : PDF généré, TVA nulle', async () => {
  const out = await generateOSPdf({ ...os, tva_non_applicable: true, returnBase64: true })
  expect(out.base64).toMatch(/^data:application\/pdf/)
  expect(out).toMatchObject({ totalHT: 2190, totalTVA: 0, totalTTC: 2190 })
})

it('ancien OS sans ligne : PDF généré quand même', async () => {
  const out = await generateOSPdf({ ...os, prestations: [], returnBase64: true })
  expect(out.base64).toMatch(/^data:application\/pdf/)
  expect(out.totalTTC).toBe(0)
})
