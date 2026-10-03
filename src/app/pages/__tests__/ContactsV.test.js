import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true), useOptionalConfirm: () => null }))
jest.mock('../../supabaseClient', () => ({ supabase: { auth: { getSession: jest.fn() } } }))
jest.mock('../../dashboards/shared', () => ({
  SB: { log: jest.fn(), deleteContact: jest.fn() },
  Icon: () => null, I: {},
  FF: ({ label, children }) => <div><span>{label}</span>{children}</div>,
  inp: {}, sel: {}, btnP: {}, btnS: {},
}))
jest.mock('../../components', () => ({
  Badge: ({ text }) => <span>{text}</span>,
  ContactInfoLink: ({ label }) => <span>{label}</span>,
  CopyIconBtn: () => null,
  ContactFormModal: () => null,
}))
jest.mock('../../components/contacts/DuplicatesModal', () => () => null)
jest.mock('../../hooks/useEntrepriseSearch', () => ({ useEntrepriseSearch: () => ({ resetEntrepriseSearch: jest.fn(), fetchEntreprise: jest.fn() }) }))
jest.mock('../../hooks/useUndoableDelete', () => ({ useUndoableDelete: () => ({ pendingIds: new Set(), scheduleDelete: jest.fn() }) }))
jest.mock('../../hooks/useConformite', () => ({
  useConformite: () => mockConf,
  conformitePost: jest.fn(),
}))

// eslint-disable-next-line import/first
import ContactsV from '../ContactsV'
// eslint-disable-next-line import/first
import { complianceByContact } from '../../lib/conformite'
// eslint-disable-next-line import/first
import { localISO } from '../../lib/today'

const today = localISO()
let mockConf
const data = {
  chantiers: [{ id: 'ch1', nom: 'Maison', statut: 'En cours' }],
  ordresService: [{ id: 'os1', chantier_id: 'ch1', artisan_nom: 'Costa Plomberie', statut: 'Émis' }],
  contacts: [
    { id: 'c1', nom: 'Costa Plomberie', type: 'Artisan', email: 'costa@ex.fr' },
    { id: 'c2', nom: 'M. Dupont', type: 'Client' },
  ],
  contactChantiers: [],
}

beforeEach(() => {
  mockConf = {
    ready: true, missingMigration: false, globalPause: false, today,
    byContact: complianceByContact([], today), lastRequest: new Map(), docs: [], reload: jest.fn(),
  }
})

describe('ContactsV', () => {
  it('s’affiche avec le bandeau « Suivi des documents » et la pastille des entreprises', async () => {
    render(<ContactsV data={data} m reload={jest.fn()} active />)
    const banner = screen.getByRole('button', { name: /Suivi des documents des entreprises/ })
    expect(banner).toHaveTextContent('0/1 entreprise suivie à jour · 0/5 documents · 1 relance au prochain passage')
    expect(screen.getByRole('button', { name: /Aucun document/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Documents à revoir/ }))
    expect(screen.queryByText('M. Dupont')).toBeNull()
    await userEvent.click(banner)
    expect(screen.getByText('Aperçu des relances automatiques')).toBeInTheDocument()
  })

  it('une fiche à laquelle une demande a été envoyée est suivie, même sans chantier ni type artisan', () => {
    mockConf = { ...mockConf, lastRequest: new Map([['c2', { dernier_envoi: '2026-10-01T08:00:00Z', envois: 1 }]]) }
    render(<ContactsV data={data} m reload={jest.fn()} active />)
    expect(screen.getByRole('button', { name: /Suivi des documents des entreprises/ })).toHaveTextContent('0/2 entreprises suivies à jour')
    expect(screen.getAllByRole('button', { name: /Aucun document/ })).toHaveLength(2)
  })

  it('migrations absentes : bandeau « À activer »', () => {
    mockConf = { ...mockConf, missingMigration: true }
    render(<ContactsV data={data} m reload={jest.fn()} active />)
    expect(screen.getByRole('button', { name: /Suivi des documents des entreprises/ })).toHaveTextContent('À activer')
  })
})
