import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConformiteSuiviModal from '../ConformiteSuiviModal'
import { complianceByContact } from '../../../lib/conformite'
import { localISO } from '../../../lib/today'

jest.mock('../../../contexts/ConfirmContext', () => ({ useOptionalConfirm: () => null }))

const today = localISO()
const contacts = [
  { id: 'a', nom: 'Alpha Maçonnerie', type: 'Artisan', email: 'a@x.fr' },
  { id: 'c', nom: 'Charlie Élec', type: 'Sous-traitant', email: 'c@x.fr' },
  { id: 'd', nom: 'Delta Peinture', type: 'Artisan' },
]
const docs = ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => ({ contact_id: 'c', kind: k, valide_au: '2099-01-01', anomalies: [], created_at: '2026-01-01' }))

function setup(extra = {}) {
  const onOpenContact = jest.fn()
  const conformite = { byContact: complianceByContact(docs, today), lastRequest: new Map(), today, missingMigration: false, ...extra }
  render(<ConformiteSuiviModal open onClose={() => {}} contacts={contacts} conformite={conformite}
    activeIds={new Set(['a', 'c', 'd'])} onOpenContact={onOpenContact} />)
  return { onOpenContact }
}

describe('ConformiteSuiviModal', () => {
  it('avancement, aperçu des relances et grille', async () => {
    const { onOpenContact } = setup()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('5 / 15')).toBeInTheDocument()
    expect(screen.getByText('Prochain passage : 1 mail')).toBeInTheDocument()
    expect(screen.getByText(/a@x\.fr\) : Kbis, Décennale, URSSAF, Fiscale, RIB · 1re demande/)).toBeInTheDocument()
    expect(screen.getByText(/1 entreprise sans email ne peut pas être relancée/)).toBeInTheDocument()
    const row = screen.getAllByRole('row').find(r => within(r).queryByText('Delta Peinture'))
    expect(within(row).getByText('Aucune : pas d’email sur la fiche')).toBeInTheDocument()
    expect(within(row).getByLabelText('Kbis : manquant')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Alpha Maçonnerie' })[0])
    expect(onOpenContact).toHaveBeenCalledWith('a')
  })

  it('migrations absentes : message', () => {
    setup({ missingMigration: true })
    expect(screen.getByText(/migrations 036 et 037/)).toBeInTheDocument()
  })
})
