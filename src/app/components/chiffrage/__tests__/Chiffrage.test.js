import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
const mockSave = jest.fn()
let mockState
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true), useOptionalConfirm: () => null }))
jest.mock('../../../supabaseClient', () => ({ supabase: {} }))
jest.mock('../../../hooks/useChiffrage', () => ({ useChiffrage: () => mockState }))
jest.mock('../../../lib/crmApi', () => ({ apiPost: jest.fn() }))

import ChiffrageSection from '../ChiffrageSection'
import ChiffrageEditor from '../ChiffrageEditor'

const CHIFFRAGE = {
  chantier_id: 'c1', surface_m2: 100, aleas_pct: 0, tva_pct: 20, description: 'Maison',
  lots: [
    { id: 'l1', nom: 'Gros œuvre', postes: [{ id: 'p1', designation: 'Fondations', quantite: 1, unite: 'ens', pu_ht: 20000 }] },
    { id: 'l2', nom: 'Électricité', postes: [{ id: 'p2', designation: 'Installation', quantite: 1, unite: 'ens', pu_ht: 8000 }] },
  ],
}

beforeEach(() => { jest.clearAllMocks(); mockState = { chiffrage: CHIFFRAGE, ready: true, missingMigration: false, save: mockSave, remove: jest.fn() } })

describe('ChiffrageSection', () => {
  it('compare estimé / engagé par lot et signale les OS sans lot', () => {
    render(<ChiffrageSection chantier={{ id: 'c1', nom: 'Villa' }} os={[
      { lot: 'Gros œuvre', statut: 'Signé', montant_ht: 22000 },
      { lot: '', statut: 'Signé', montant_ht: 1500 },
    ]} />)
    const row = screen.getByText('Gros œuvre').closest('tr')
    expect(within(row).getByText(/1 OS/)).toBeInTheDocument()
    expect(within(row).getByText(/\+2\s000/)).toBeInTheDocument()
    expect(screen.getByText(/OS sans lot \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/280\s€\/m²/)).toBeInTheDocument()
  })

  it('sans chiffrage : bouton de création ; migration absente : message', () => {
    mockState = { ...mockState, chiffrage: null }
    const { rerender } = render(<ChiffrageSection chantier={{ id: 'c1' }} />)
    expect(screen.getByRole('button', { name: /Créer le chiffrage/ })).toBeInTheDocument()
    mockState = { ...mockState, missingMigration: true }
    rerender(<ChiffrageSection chantier={{ id: 'c1' }} />)
    expect(screen.getByText(/migration 040/)).toBeInTheDocument()
  })
})

describe('ChiffrageEditor', () => {
  it('modifie un prix, recalcule et enregistre des lots propres', async () => {
    const onSave = jest.fn().mockResolvedValue()
    render(<ChiffrageEditor open initial={CHIFFRAGE} chantier={{ nom: 'Villa' }} onClose={jest.fn()} onSave={onSave} />)
    const pu = screen.getAllByLabelText('Prix unitaire HT')[1]
    // fireEvent : la modale déplace le focus à l'ouverture (frappe non déterministe)
    fireEvent.change(pu, { target: { value: '9000,5' } })
    expect(screen.getByText(/Travaux HT/).textContent).toMatch(/29\s001/)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.lots[1].postes[0]).toMatchObject({ designation: 'Installation', pu_ht: 9000.5, quantite: 1 })
    expect(saved).toMatchObject({ description: 'Maison', tva_pct: '20' })
  })

  it('refuse un lot sans nom', async () => {
    const onSave = jest.fn()
    render(<ChiffrageEditor open initial={{ lots: [{ nom: '', postes: [{ designation: 'X', quantite: 1, pu_ht: 10 }] }] }} chantier={{}} onClose={jest.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith('Chaque lot doit avoir un nom', 'error')
  })
})
