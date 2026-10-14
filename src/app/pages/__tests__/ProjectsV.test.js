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
    SB: { upsertChantier: jest.fn(), log: jest.fn(), reorderChantiers: jest.fn() },
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
  AttachmentsSection: () => <div>Pièces jointes du chantier</div>,
  CommentsSection: () => <div>Commentaires du chantier</div>,
  TemplateSelector: () => null,
  ProcesVerbalReception: () => <div>PV de réception</div>,
  ChantierIntervenants: () => <div>Intervenants du chantier</div>,
  ChantierPlanning: () => <div>Planning du chantier</div>,
  ChantierBudgetCard: () => <div>Jauge budget</div>,
}))
jest.mock('../../hooks/useAttachments', () => ({ useAttachments: () => ({ attachments: [] }) }))
jest.mock('../../hooks/useComments', () => ({ useComments: () => ({ comments: [] }) }))
const mockSync = () => Promise.resolve(0)
jest.mock('../../hooks/useSignaturesSync', () => ({ useSignaturesSync: () => ({ sync: mockSync }) }))
jest.mock('../../hooks/useSaveTask', () => ({ useSaveTask: () => jest.fn() }))
jest.mock('../../hooks/useConformite', () => ({ useConformite: () => ({ ready: false, byContact: new Map(), missingMigration: false }) }))
jest.mock('../../hooks/useChiffrage', () => ({ useChiffrage: () => ({ chiffrage: null, ready: true, missingMigration: false }) }))
jest.mock('../../components/chiffrage/ChiffrageSection', () => () => null)
jest.mock('../../components/cr/CREditor', () => () => null)
jest.mock('../../components/cr/CRSendModal', () => () => null)
jest.mock('../../lib/crDb', () => ({ markDiffused: jest.fn() }))
const apiPost = jest.fn()
jest.mock('../../lib/crmApi', () => ({ apiPost: (...a) => apiPost(...a) }))
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

describe('client invité par son adresse Gmail', () => {
  const sansCompte = { ...CHANTIER, client_user_id: null, client: 'Havre De Savoir' }

  it('adresse saisie : enregistrement = rattachement seul, sans mail', async () => {
    SB.upsertChantier.mockResolvedValue({ id: CHANTIER.id })
    apiPost.mockResolvedValue({ ok: true, linked: false, invited: false })
    renderPage([sansCompte])
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByRole('option', { name: 'Jean Dupont — jean@client.fr' })
    await userEvent.type(screen.getByLabelText('Adresse Gmail du client'), 'Havre.Savoir@Gmail.com')
    expect(screen.queryByRole('button', { name: "Envoyer l'invitation au client" })).not.toBeInTheDocument()
    expect(screen.getByText(/tu pourras ensuite lui envoyer l.invitation quand tu veux/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/clients/invite', { chantierId: CHANTIER.id, email: 'havre.savoir@gmail.com', envoyer: false }))
    expect(addToast).toHaveBeenCalledWith('Chantier enregistré : havre.savoir@gmail.com le verra à sa première connexion avec Google', 'success')
  })

  it('adresse enregistrée : invitation envoyée seulement au clic', async () => {
    SB.upsertChantier.mockResolvedValue({ id: CHANTIER.id })
    apiPost.mockResolvedValue({ ok: true, linked: false, invited: true })
    renderPage([{ ...sansCompte, client_email: 'havre@gmail.com' }])
    expect(screen.getByText('Client invité : havre@gmail.com (en attente de sa première connexion)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await screen.findByRole('option', { name: 'Invité par son adresse (havre@gmail.com)' })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(SB.upsertChantier).toHaveBeenCalled())
    expect(apiPost).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Modifier le chantier Villa Dupont' }))
    await userEvent.click(await screen.findByRole('button', { name: "Envoyer l'invitation au client" }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/clients/invite', { chantierId: CHANTIER.id, email: 'havre@gmail.com', envoyer: true }))
    expect(addToast).toHaveBeenCalledWith('Invitation envoyée à havre@gmail.com', 'success')
    await userEvent.selectOptions(accountSelect(), 'u1')
    expect(screen.queryByLabelText('Adresse Gmail du client')).not.toBeInTheDocument()
  })
})

describe('fiche chantier : bandeau et onglets', () => {
  const late = { id: 't1', chantierId: CHANTIER.id, titre: 'Reprendre enduit', statut: 'En cours', echeance: '2020-01-01', num_point: 1 }
  function renderDetail() {
    const data = { chantiers: [{ ...CHANTIER, budget: 1000 }], tasks: [late], ordresService: [], compteRendus: [], planning: [], contacts: [] }
    return render(<ProjectsV data={data} m={false} reload={jest.fn()} user={null} profile={{ role: 'admin' }} focusId={CHANTIER.id} />)
  }

  it("s'ouvre sur Suivi avec le bandeau", async () => {
    renderDetail()
    expect(await screen.findByRole('tab', { name: 'Suivi' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('group', { name: "En un coup d'œil" })).toHaveTextContent('1 en retard')
    expect(screen.getByText('Reprendre enduit')).toBeInTheDocument()
    expect(screen.getByText('PV de réception')).toBeInTheDocument()
    expect(screen.queryByText('Intervenants du chantier')).not.toBeInTheDocument()
    expect(screen.queryByText('Jauge budget')).not.toBeInTheDocument()
  })

  it('passe aux autres onglets, au clavier aussi', async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(await screen.findByRole('tab', { name: 'Entreprises' }))
    expect(screen.getByText('Intervenants du chantier')).toBeInTheDocument()
    expect(screen.queryByText('Reprendre enduit')).not.toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Pièces jointes du chantier')).toBeInTheDocument()
    expect(screen.getByText('Commentaires du chantier')).toBeInTheDocument()
  })

  it('la tuile budget mène aux finances', async () => {
    const user = userEvent.setup()
    renderDetail()
    await user.click(await screen.findByRole('button', { name: /Budget engagé/ }))
    expect(screen.getByRole('tab', { name: 'Finances' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Jauge budget')).toBeInTheDocument()
  })
})

describe('ordre des chantiers', () => {
  const chs = [
    { ...CHANTIER, id: 'a', nom: 'Alpha', ordre: 2, client_user_id: 'u1' },
    { ...CHANTIER, id: 'b', nom: 'Bravo', ordre: 1, client_user_id: 'u1' },
    { ...CHANTIER, id: 'c', nom: 'Charlie', ordre: null, created_at: '2026-10-10', client_user_id: 'u1' },
  ]
  const names = () => screen.getAllByTestId('chantier-row').map(r => r.textContent.match(/Alpha|Bravo|Charlie/)[0])

  it('cartes dans l’ordre enregistré, sans poignée ; « Ranger » ouvre la liste à faire glisser', async () => {
    SB.reorderChantiers.mockResolvedValue()
    renderPage(chs)
    expect(screen.queryByRole('button', { name: /^Déplacer/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Modifier le chantier/ }).map(b => b.getAttribute('aria-label')))
      .toEqual(['Modifier le chantier Charlie', 'Modifier le chantier Bravo', 'Modifier le chantier Alpha'])
    await userEvent.click(screen.getByRole('button', { name: 'Ranger' }))
    expect(screen.queryByLabelText('Rechercher un chantier')).not.toBeInTheDocument()
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha'])
    screen.getByRole('button', { name: 'Déplacer Alpha (flèches haut et bas)' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(names()).toEqual(['Charlie', 'Alpha', 'Bravo'])
    expect(SB.reorderChantiers).toHaveBeenCalledWith([{ id: 'c', ordre: 1 }, { id: 'b', ordre: 3 }])
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(screen.queryByTestId('chantier-row')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Modifier le chantier/ })[1]).toHaveAttribute('aria-label', 'Modifier le chantier Alpha')
  })

  it('échec de l’enregistrement : ordre précédent rétabli, message', async () => {
    SB.reorderChantiers.mockRejectedValue(new Error("L'ordre des chantiers demande la migration 047 (Supabase)."))
    renderPage(chs)
    await userEvent.click(screen.getByRole('button', { name: 'Ranger' }))
    screen.getByRole('button', { name: 'Déplacer Bravo (flèches haut et bas)' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(addToast).toHaveBeenCalledWith("L'ordre des chantiers demande la migration 047 (Supabase).", 'error'))
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })
})
