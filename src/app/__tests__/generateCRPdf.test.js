/**
 * @jest-environment node
 */
// Génération réelle du PDF de CR (jsPDF) : page de garde + corps, sans erreur,
// pour un CR complet et pour un ancien CR (sans actions ni convocation).
jest.mock('../dashboards/shared', () => ({
  SB: { log: jest.fn() },
  COMPANY: jest.requireActual('../lib/company').COMPANY,
}))
jest.mock('../logo', () => ({ LOGO_B64: '' }))

const { generateCRPdf } = require('../generators')

const chantier = { id: 'ch', nom: 'Villa Dupont — extension', client: 'M. Dupont', adresse: '3 rue du Port, 76600 Le Havre', phase: 'Gros œuvre' }
const pages = (b64) => (Buffer.from(b64.split(',')[1], 'base64').toString('latin1').match(/\/Type \/Page\b/g) || []).length

it('CR complet : page de garde, convocation, suivi des actions', async () => {
  const cr = {
    id: 'cr', numero: 12, date: '2026-09-30', resume: 'Avancement conforme.\n'.repeat(40), decisions: 'Choix du carrelage validé.',
    participants: 'Bureau de contrôle',
    intervenants: [
      { nom: 'M. Dupont', role: "Maître d'ouvrage", presence: 'Présent', convoque: true, email: 'd@ex.fr' },
      { nom: 'Martin', societe: 'Martin Élec', presence: 'Absent', convoque: true, tel: '06 00 00 00 00' },
      { nom: 'BET Structure', presence: 'Excusé', convoque: false },
    ],
    prochaine_reunion: { date: '2026-10-07', heure: '14:00', lieu: 'Base vie' },
    taches_suivi: Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`, titre: `Action n°${i} « reprise »`, entreprise: 'Martin Élec', echeance: '2026-09-25',
      priorite: i % 3 ? 'En cours' : 'Urgent', suivi: ['relance', 'en_cours', 'fait', 'nouveau'][i % 4], rappels: i % 4 === 0 ? 2 : 0, origine: 10,
    })),
  }
  const out = await generateCRPdf(cr, chantier, { returnBase64: true })
  expect(out.filename).toBe('CR-12-Villa_Dupont_extension.pdf')
  expect(out.base64).toMatch(/^data:application\/pdf/)
  expect(pages(out.base64)).toBeGreaterThanOrEqual(3)
})

it('ancien CR (sans convocation ni actions)', async () => {
  const out = await generateCRPdf({ numero: 1, date: '2025-01-10', resume: 'RAS', participants: 'Martin, Durand' }, chantier, { returnBase64: true })
  expect(pages(out.base64)).toBe(2)
})
