import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OsCard from '../OsCard'

// Fixture minimale : seuls les champs consommés par OsCard. Libre à
// chaque test d'en surcharger pour exercer un cas particulier.
const baseOs = {
  id: 'os-1',
  numero: 'OS-2026-001',
  statut: 'Émis',
  client_nom: 'Client Test',
  artisan_nom: 'Artisan X',
  artisan_specialite: 'Plomberie',
  date_emission: '2026-04-20',
  date_intervention: '2026-05-01',
  date_fin_prevue: '2026-06-01',
  montant_ht: 1000,
  montant_ttc: 1200,
  prestations: [{ description: 'Test' }],
}

const baseChantier = { id: 'ch-1', nom: 'Chantier Test' }

// Helper : fournit des no-op pour les 8 callbacks obligatoires, et
// permet de surcharger juste ceux qu'on veut vérifier dans chaque test.
function renderCard(overrides = {}) {
  const handlers = {
    onPdf: jest.fn(),
    onExcel: jest.fn(),
    onEmail: jest.fn(),
    onSignOpen: jest.fn(),
    onSignReset: jest.fn(),
    onDuplicate: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  }
  render(
    <OsCard
      os={baseOs}
      ch={baseChantier}
      overdue={false}
      generating={null}
      readOnly={false}
      m={false}
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

describe('OsCard', () => {
  it('affiche le numéro, le statut, le chantier et le montant TTC', () => {
    renderCard()

    expect(screen.getByText('OS-2026-001')).toBeInTheDocument()
    expect(screen.getByText('Chantier Test')).toBeInTheDocument()
    // Un des Badge affiche le statut
    expect(screen.getAllByText('Émis').length).toBeGreaterThan(0)
    // Le montant est formaté en €
    expect(screen.getByText(/1\s*200/)).toBeInTheDocument()
  })

  it("affiche le badge '⚠ En retard' quand overdue=true", () => {
    renderCard({ overdue: true })
    expect(screen.getByText(/En retard/)).toBeInTheDocument()
  })

  it("n'affiche pas le badge 'En retard' quand overdue=false", () => {
    renderCard({ overdue: false })
    expect(screen.queryByText(/En retard/)).not.toBeInTheDocument()
  })

  it('déclenche onPdf(os) au clic sur "PDF"', async () => {
    const handlers = renderCard()
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }))
    expect(handlers.onPdf).toHaveBeenCalledWith(baseOs)
  })

  it('déclenche onExcel(os) au clic sur "XLS"', async () => {
    const handlers = renderCard()
    await userEvent.click(screen.getByRole('button', { name: /XLS/ }))
    expect(handlers.onExcel).toHaveBeenCalledWith(baseOs)
  })

  it('déclenche onDuplicate / onEdit / onDelete sur les boutons correspondants', async () => {
    const handlers = renderCard()

    await userEvent.click(screen.getByRole('button', { name: /Dupliquer/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(handlers.onDuplicate).toHaveBeenCalledWith(baseOs)
    expect(handlers.onEdit).toHaveBeenCalledWith(baseOs)
    expect(handlers.onDelete).toHaveBeenCalledWith(baseOs)
  })

  it('en mode readOnly : cache les boutons Dupliquer / Modifier / Supprimer / Signature', () => {
    renderCard({ readOnly: true })

    expect(screen.queryByRole('button', { name: /Dupliquer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Signature/ })).not.toBeInTheDocument()

    // Les boutons Export/Email restent disponibles (lecture seule UX).
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Email/ })).toBeInTheDocument()
  })

  it('affiche "✍ Signature" quand l\'OS n\'a pas de lien Odoo, et le lien sinon', () => {
    // Sans lien Odoo → bouton d'envoi
    const { unmount } = render(
      <OsCard
        os={baseOs}
        ch={baseChantier}
        overdue={false}
        generating={null}
        readOnly={false}
        m={false}
        onPdf={() => {}} onExcel={() => {}} onEmail={() => {}}
        onSignOpen={() => {}} onSignReset={() => {}}
        onDuplicate={() => {}} onEdit={() => {}} onDelete={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /Signature/ })).toBeInTheDocument()
    unmount()

    // Avec lien Odoo → lien "✍ Signé" + bouton reset
    const osSigned = { ...baseOs, odoo_sign_url: 'https://odoo.example/sign/42', statut_signature: 'Signé' }
    render(
      <OsCard
        os={osSigned}
        ch={baseChantier}
        overdue={false}
        generating={null}
        readOnly={false}
        m={false}
        onPdf={() => {}} onExcel={() => {}} onEmail={() => {}}
        onSignOpen={() => {}} onSignReset={() => {}}
        onDuplicate={() => {}} onEdit={() => {}} onDelete={() => {}}
      />
    )
    expect(screen.getByRole('link', { name: /Signé/ })).toHaveAttribute('href', 'https://odoo.example/sign/42')
  })

  it('désactive les boutons export quand une génération est en cours', () => {
    renderCard({ generating: { id: 'os-1', kind: 'pdf' } })

    const pdfBtn = screen.getByRole('button', { name: /Génération/ })
    expect(pdfBtn).toBeDisabled()

    const xlsBtn = screen.getByRole('button', { name: /XLS/ })
    expect(xlsBtn).toBeDisabled()
  })
})
