import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConformiteSuiviModal from '../ConformiteSuiviModal'
import { complianceByContact } from '../../../lib/conformite'
import { localISO } from '../../../lib/today'

const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../contexts/ConfirmContext', () => ({ useOptionalConfirm: () => null, useConfirm: () => jest.fn().mockResolvedValue(true) }))
const mockPost = jest.fn()
jest.mock('../../../hooks/useConformite', () => ({ conformitePost: (...a) => mockPost(...a) }))

const today = localISO()
const contacts = [
  { id: 'a', nom: 'Alpha Maçonnerie', type: 'Artisan', email: 'a@x.fr' },
  { id: 'c', nom: 'Charlie Élec', type: 'Sous-traitant', email: 'c@x.fr' },
  { id: 'd', nom: 'Delta Peinture', type: 'Artisan' },
]
const docs = ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => ({ contact_id: 'c', kind: k, valide_au: '2099-01-01', anomalies: [], created_at: '2026-01-01' }))

beforeEach(() => { mockPost.mockReset(); addToast.mockReset() })

function setup(extra = {}) {
  const onOpenContact = jest.fn()
  const onChanged = jest.fn()
  const conformite = { byContact: complianceByContact(docs, today), lastRequest: new Map(), today, missingMigration: false, ...extra }
  render(<ConformiteSuiviModal open onClose={() => {}} contacts={contacts} conformite={conformite}
    activeIds={new Set(['a', 'c', 'd'])} onOpenContact={onOpenContact} onChanged={onChanged} />)
  return { onOpenContact, onChanged }
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

  it('actions : envoyer maintenant, relancer, suspendre une entreprise, tout suspendre', async () => {
    mockPost.mockResolvedValue({ sent: ['Alpha Maçonnerie'], failed: [] })
    const { onChanged } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer maintenant (1)' }))
    expect(mockPost).toHaveBeenCalledWith({ action: 'relancer', contactIds: ['a'] })
    expect(addToast).toHaveBeenCalledWith('1 mail envoyé', 'success')
    expect(onChanged).toHaveBeenCalled()

    const row = screen.getAllByRole('row').find(r => within(r).queryByText('Delta Peinture'))
    expect(within(row).queryByRole('button', { name: /Relancer/ })).toBeNull() // pas d'email
    mockPost.mockResolvedValue({})
    await userEvent.selectOptions(within(row).getByLabelText('Suspendre les relances de Delta Peinture'), '0')
    expect(mockPost).toHaveBeenLastCalledWith({ action: 'pause', contactId: 'd', paused: true, until: null })

    await userEvent.click(screen.getByRole('button', { name: /Tout suspendre/ }))
    expect(mockPost).toHaveBeenLastCalledWith({ action: 'pause_all', paused: true })
  })

  it('relances suspendues : affichage et reprise', async () => {
    mockPost.mockResolvedValue({})
    setup({ globalPause: true })
    expect(screen.getByText(/Toutes les relances automatiques sont suspendues/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Reprendre les relances/ }))
    expect(mockPost).toHaveBeenCalledWith({ action: 'pause_all', paused: false })
  })

  it('migrations absentes : message', () => {
    setup({ missingMigration: true })
    expect(screen.getByText(/migrations 036 et 037/)).toBeInTheDocument()
  })
})
