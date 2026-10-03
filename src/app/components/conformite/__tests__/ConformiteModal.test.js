import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConformiteModal from '../ConformiteModal'
import ConformiteBadge from '../ConformiteBadge'
import { contactCompliance } from '../../../lib/conformite'
import { localISO } from '../../../lib/today'

const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true), useOptionalConfirm: () => null }))
const mockPost = jest.fn()
jest.mock('../../../hooks/useConformite', () => ({ conformitePost: (...a) => mockPost(...a) }))
const mockUpload = jest.fn()
jest.mock('../../../lib/conformiteClient', () => ({ uploadConformiteDoc: (...a) => mockUpload(...a) }))

const today = localISO()
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const contact = { id: 'c1', nom: 'Costa', societe: 'Costa Plomberie', email: 'costa@ex.fr', type: 'Artisan' }
const docs = [
  { id: 'd1', contact_id: 'c1', kind: 'decennale', file_name: 'decennale.pdf', valide_au: inDays(200), assureur: 'SMABTP', numero_police: 'P-1', activites: 'Plomberie', anomalies: [], created_at: '2026-01-01' },
  { id: 'd2', contact_id: 'c1', kind: 'urssaf', file_name: 'urssaf.pdf', valide_au: inDays(-3), code_securite: 'XYZ', anomalies: ['Document non signé.'], created_at: '2026-01-01' },
]

function setup(props = {}) {
  const onChanged = jest.fn()
  const utils = render(
    <ConformiteModal open onClose={() => {}} contact={contact} compliance={contactCompliance(docs, today)}
      lastRequest={null} missingMigration={false} onChanged={onChanged} {...props} />,
  )
  return { ...utils, onChanged }
}

beforeEach(() => { mockPost.mockReset(); mockUpload.mockReset(); addToast.mockReset() })

describe('ConformiteModal', () => {
  it('affiche l’état de chaque document, les détails et les points à vérifier', () => {
    setup()
    expect(screen.getByText('Documents — Costa Plomberie')).toBeInTheDocument()
    expect(screen.getByText('Extrait Kbis')).toBeInTheDocument()
    expect(screen.getAllByText(/Manquant · Aucun document/)).toHaveLength(3)
    expect(screen.getByText('RIB (relevé d’identité bancaire)')).toBeInTheDocument()
    expect(screen.getByText(/Expiré · Expiré depuis le/)).toBeInTheDocument()
    expect(screen.getByText('Assureur : SMABTP – P-1')).toBeInTheDocument()
    expect(screen.getByText('XYZ')).toBeInTheDocument()
    expect(screen.getByText('Document non signé.')).toBeInTheDocument()
  })

  it('dépôt d’un document : lu puis enregistré', async () => {
    mockUpload.mockResolvedValue({ id: 'd3', anomalies: [] })
    const { container, onChanged } = setup()
    const kbis = screen.getByText('Extrait Kbis').closest('div[style*="border-left"]')
    await userEvent.click(within(kbis).getByRole('button', { name: 'Déposer' }))
    const file = new File(['%PDF'], 'kbis.pdf', { type: 'application/pdf' })
    fireEvent.change(container.ownerDocument.querySelector('input[type="file"]'), { target: { files: [file] } })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Function), { kind: 'kbis', file, extra: { contactId: 'c1' } })
    expect(addToast).toHaveBeenCalledWith('Kbis enregistré', 'success')
  })

  it('correction des dates', async () => {
    mockPost.mockResolvedValue({})
    setup()
    const urssaf = screen.getByText('Attestation de vigilance URSSAF').closest('div[style*="border-left"]')
    await userEvent.click(within(urssaf).getByRole('button', { name: 'Dates' }))
    fireEvent.change(within(urssaf).getByLabelText('Date du document'), { target: { value: '2026-09-15' } })
    await userEvent.click(within(urssaf).getByRole('button', { name: 'Enregistrer' }))
    expect(mockPost).toHaveBeenCalledWith({ action: 'update', id: 'd2', date_document: '2026-09-15', valide_au: undefined, verifie: true })
  })

  it('demande envoyée à l’entreprise : lien affiché', async () => {
    mockPost.mockResolvedValue({ sent: true, email: 'costa@ex.fr', link: 'https://app/deposer/abc' })
    setup()
    expect(screen.getByLabelText('Email de l’entreprise')).toHaveValue('costa@ex.fr')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }))
    expect(mockPost).toHaveBeenCalledWith({ action: 'request', contactId: 'c1', email: 'costa@ex.fr' })
    expect(await screen.findByLabelText('Lien de dépôt')).toHaveValue('https://app/deposer/abc')
    expect(addToast).toHaveBeenCalledWith('Demande envoyée à costa@ex.fr', 'success')
  })

  it('migration non appliquée : message', () => {
    setup({ missingMigration: true })
    expect(screen.getByText(/appliquer la migration 036/)).toBeInTheDocument()
  })
})

describe('ConformiteBadge', () => {
  it('résume l’état', async () => {
    const onClick = jest.fn()
    const { rerender } = render(<ConformiteBadge compliance={contactCompliance([], today)} onClick={onClick} />)
    expect(screen.getByRole('button', { name: /Aucun document/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
    const all = ['kbis', 'decennale', 'urssaf', 'fiscale', 'rib'].map(k => ({ contact_id: 'c1', kind: k, valide_au: inDays(100), anomalies: [] }))
    rerender(<ConformiteBadge compliance={contactCompliance(all, today)} />)
    expect(screen.getByText(/Documents à jour/)).toBeInTheDocument()
    rerender(<ConformiteBadge compliance={contactCompliance([...all.slice(0, 3), { ...all[3], valide_au: inDays(-1) }, all[4]], today)} />)
    expect(screen.getByText(/Fiscale : expiré/)).toBeInTheDocument()
  })
})
