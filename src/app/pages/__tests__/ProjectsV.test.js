import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true) }))
jest.mock('../../supabaseClient', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('../../generators', () => ({}))
// shared.js importe components/index.js qui ré-importe shared.js (cycle) :
// on mocke le strict nécessaire plutôt que requireActual.
jest.mock('../../dashboards/shared', () => {
  const { cloneElement, isValidElement } = require('react')
  return {
    SB: { upsertChantier: jest.fn(), log: jest.fn() },
    Icon: () => null,
    I: {},
    phase: {}, status: {},
    PBar: () => null,
    FF: ({ label, hint, children }) => {
      const id = `ff-${label}`
      const native = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type)
      return (
        <div>
          <label htmlFor={native ? id : undefined}>{label}</label>
          {native ? cloneElement(children, { id }) : children}
          {hint && <div>{hint}</div>}
        </div>
      )
    },
    inp: {}, sel: {}, btnP: {}, btnS: {},
    fmtMoney: (n) => `${Number(n) || 0} €`,
    fmtDate: (d) => String(d || ''),
  }
})
jest.mock('../../components', () => ({
  Badge: ({ text }) => <span>{text}</span>,
  Modal: ({ open, title, children }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
  AddressPicker: () => null,
}))
jest.mock('../../hooks/useAttachments', () => ({ useAttachments: () => ({ attachments: [] }) }))
jest.mock('../../hooks/useComments', () => ({ useComments: () => ({ comments: [] }) }))
const mockSync = () => Promise.resolve(0)
jest.mock('../../hooks/useSignaturesSync', () => ({ useSignaturesSync: () => ({ sync: mockSync }) }))
jest.mock('../../hooks/useSaveTask', () => ({ useSaveTask: () => jest.fn() }))
jest.mock('../../components/cr/CREditor', () => () => null)
jest.mock('../../components/cr/CRSendModal', () => () => null)
jest.mock('../../lib/crDb', () => ({ markDiffused: jest.fn() }))
jest.mock('../../lib/crPhotos', () => ({ loadCrImages: jest.fn() }))

// eslint-disable-next-line import/first
import ProjectsV from '../ProjectsV'
// eslint-disable-next-line import/first
import { SB } from '../../dashboards/shared'
// eslint-disable-next-line import/first
import { supabase } from '../../supabaseClient'

const ACCOUNTS = [
  { user_id: 'u1', prenom: 'Jean', nom: 'Dupont', email: 'jean@client.fr' },
  { user_id: 'u2', prenom: 'Marie', nom: 'Martin', email: 'marie@client.fr' },
]
const CHANTIER = {
  id: '00000000-0000-4000-8000-000000000001', nom: 'Villa Dupont', client: 'Jean Dupont',
  adresse: 'Le Havre', phase: 'Finitions', statut: 'En cours', lots: [], client_user_id: 'u1',
}

function renderPage(chantiers = []) {
  const data = { chantiers, tasks: [], ordresService: [], compteRendus: [], planning: [], contacts: [] }
  return render(<ProjectsV data={data} m={false} reload={jest.fn()} user={null} profile={{ role: 'admin' }} />)
}
const accountSelect = () => screen.getByLabelText('Compte client (accès au suivi)')
const clientInput = () => screen.getByLabelText('Client')

beforeEach(() => {
  jest.clearAllMocks()
  supabase.rpc.mockResolvedValue({ data: ACCOUNTS, error: null })
  SB.upsertChantier.mockResolvedValue({ id: 'x' })
})

describe('ProjectsV — compte client du chantier', () => {
  it('nouveau chantier : liste chargée, « Automatique » par défaut, choix envoyé à la sauvegarde', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau' }))
    expect(supabase.rpc).toHaveBeenCalledWith('client_accounts')
    await screen.findByRole('option', { name: 'Jean Dupont — jean@client.fr' })
    expect(accountSelect()).toHaveValue('')
    expect(screen.getByRole('option', { name: "Automatique (d'après le nom du client)" })).toBeInTheDocument()
    expect(screen.getByText("Le client ne voit le chantier que s'il est rattaché à son compte.")).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Nom'), 'Maison Martin')
    await userEvent.selectOptions(accountSelect(), 'u2')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(SB.upsertChantier.mock.calls[0][0]).toMatchObject({ nom: 'Maison Martin', client_user_id: 'u2' })
  })

  it('nouveau chantier sans choix : client_user_id null (rattachement automatique)', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau' }))
    await screen.findByRole('option', { name: 'Jean Dupont — jean@client.fr' })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(SB.upsertChantier.mock.calls[0][0]).toHaveProperty('client_user_id', null)
  })

  it('modification : valeur initiale reprise, remise sur « Automatique » si on change le client', async () => {
    renderPage([CHANTIER])
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByRole('option', { name: 'Jean Dupont — jean@client.fr' })
    expect(accountSelect()).toHaveValue('u1')

    await userEvent.type(clientInput(), ' et Marie')
    expect(accountSelect()).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(SB.upsertChantier.mock.calls[0][0]).toMatchObject({ client: 'Jean Dupont et Marie', client_user_id: null })
  })

  it('choix fait à la main : conservé si on change ensuite le client', async () => {
    renderPage([CHANTIER])
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByRole('option', { name: 'Marie Martin — marie@client.fr' })
    await userEvent.selectOptions(accountSelect(), 'u2')
    await userEvent.type(clientInput(), ' bis')
    expect(accountSelect()).toHaveValue('u2')
  })

  it('compte actuel absent de la liste : affiché quand même, sans être perdu', async () => {
    renderPage([{ ...CHANTIER, client_user_id: 'u-ancien' }])
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByRole('option', { name: 'Compte actuel (inactif ou introuvable)' })
    expect(accountSelect()).toHaveValue('u-ancien')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(SB.upsertChantier.mock.calls[0][0]).toHaveProperty('client_user_id', 'u-ancien')
  })

  it('liste indisponible (fonction absente) : phrase courte, le formulaire reste utilisable', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    renderPage([CHANTIER])
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByText(/Liste des comptes indisponible/)
    expect(screen.queryByLabelText('Compte client (accès au suivi)')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(SB.upsertChantier.mock.calls[0][0]).toHaveProperty('client_user_id', 'u1')
  })
})
