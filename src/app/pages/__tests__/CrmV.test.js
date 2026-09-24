import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true) }))
jest.mock('../../supabaseClient', () => ({ supabase: {} }))
// shared.js importe components/index.js qui ré-importe shared.js (cycle) :
// on mocke le strict nécessaire plutôt que requireActual.
jest.mock('../../dashboards/shared', () => ({
  SB: { upsertChantier: jest.fn(), addContactChantier: jest.fn() },
  Icon: () => null,
  I: {},
  FF: ({ label, children, error }) => <div><label>{label}</label>{children}{error && <div role="alert">{error}</div>}</div>,
  inp: {}, sel: {}, btnP: {}, btnS: {},
  fmtMoney: (n) => `${Number(n) || 0} €`,
  fmtDate: (d) => String(d || ''),
}))
jest.mock('../../components', () => ({
  ContactPicker: jest.requireActual('../../components/ContactPicker').default,
  Badge: ({ text }) => <span>{text}</span>,
  EmptyState: ({ title }) => <div role="status">{title}</div>,
  Modal: ({ open, title, children }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}))
jest.mock('../../components/Skeleton', () => ({ PageSkeleton: () => <div>loading</div> }))

jest.mock('../../lib/crmDb', () => ({
  loadCrm: jest.fn(),
  upsertOpportunite: jest.fn(),
  moveOpportunite: jest.fn(),
  deleteOpportunite: jest.fn(),
  upsertInteraction: jest.fn(),
  setActionFaite: jest.fn(),
  deleteInteraction: jest.fn(),
  linkOpportuniteToChantier: jest.fn(),
  upsertDevis: jest.fn(),
  setDevisStatut: jest.fn(),
  deleteDevis: jest.fn(),
}))
// eslint-disable-next-line import/first
import * as crmDb from '../../lib/crmDb'

// eslint-disable-next-line import/first
import CrmV from '../CrmV'

const data = {
  chantiers: [],
  contacts: [{ id: 'c1', nom: 'Dupont', societe: 'SCI Dupont', type: 'Client', tel: '0600000000' }],
}

function renderPage(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <CrmV data={data} m={false} reload={jest.fn()} setTab={jest.fn()} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  crmDb.loadCrm.mockResolvedValue({
    opportunites: [
      { id: 'o1', titre: 'Rénovation Dupont', etape: 'Qualifié', montant_estime: 42000, probabilite: 30, contact_id: 'c1' },
      { id: 'o2', titre: 'Extension Martin', etape: 'Gagné', montant_estime: 10000, probabilite: 100, date_cloture: '2026-09-02' },
    ],
    interactions: [
      { id: 'i1', opportunite_id: 'o1', type: 'Appel', sujet: 'Premier contact', date: '2026-09-01T10:00:00Z',
        prochaine_action: 'Envoyer le devis', prochaine_action_date: '2020-01-01', action_faite: false },
    ],
    missingMigration: false,
  })
})

describe('CrmV', () => {
  it('affiche le pipeline avec les affaires actives et les KPI', async () => {
    renderPage()
    expect(await screen.findByText('Rénovation Dupont')).toBeInTheDocument()
    // L'affaire gagnée n'est pas dans le pipeline actif
    expect(screen.queryByText('Extension Martin')).not.toBeInTheDocument()
    expect(screen.getByText('En cours')).toBeInTheDocument()
    expect(screen.getByText('1 en retard')).toBeInTheDocument()
  })

  it('ouvre le détail au clic et liste les interactions', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Ouvrir Rénovation Dupont/ }))
    expect(await screen.findByText('Premier contact')).toBeInTheDocument()
    expect(screen.getAllByText(/Envoyer le devis/).length).toBeGreaterThan(0)
    expect(screen.getByText('Dupont · SCI Dupont')).toBeInTheDocument()
  })

  it('valide le formulaire de création puis appelle upsertOpportunite', async () => {
    const user = userEvent.setup()
    crmDb.upsertOpportunite.mockResolvedValue({ id: 'o3', titre: 'Nouvelle affaire' })
    renderPage()
    await screen.findByText('Rénovation Dupont')
    await user.click(screen.getByRole('button', { name: /\+ Nouvelle affaire/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le titre est requis.')

    await user.type(screen.getByPlaceholderText(/^Ex : Rénovation maison Dupont$/), 'Nouvelle affaire')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(crmDb.upsertOpportunite).toHaveBeenCalledWith(
      expect.objectContaining({ titre: 'Nouvelle affaire', etape: 'Prospect' }),
    ))
    expect(addToast).toHaveBeenCalledWith('Affaire créée', 'success')
  })

  it('affiche un bandeau si la migration 025 est absente', async () => {
    crmDb.loadCrm.mockResolvedValue({ opportunites: [], interactions: [], missingMigration: true })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/025_crm\.sql/)
  })

  it('la vue Relances liste les actions en retard', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rénovation Dupont')
    await user.click(screen.getByRole('button', { name: /^Relances \d+$/ }))
    expect(await screen.findByText('En retard')).toBeInTheDocument()
    expect(screen.getByText(/Envoyer le devis/)).toBeInTheDocument()
  })
})

describe('CrmV — navigation entrante (focusId)', () => {
  it('"contact:<id>" filtre le pipeline sur le nom du contact', async () => {
    renderPage({ focusId: 'contact:c1', focusTs: 1 })
    await screen.findByText('Rénovation Dupont')
    expect(screen.getByRole('searchbox', { name: /Rechercher une affaire/ })).toHaveValue('Dupont')
  })

  it('"new:<id>" ouvre le formulaire pré-rempli avec le contact', async () => {
    renderPage({ focusId: 'new:c1', focusTs: 2 })
    await screen.findByText('Rénovation Dupont')
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle affaire' })
    expect(dialog).toBeInTheDocument()
    // Le contact pré-rempli s'affiche en pastille dans le sélecteur
    expect(screen.getByRole('button', { name: 'Retirer le contact' })).toBeInTheDocument()
    expect(screen.getByText('· SCI Dupont')).toBeInTheDocument()
  })

  it('un id d’opportunité ouvre son détail', async () => {
    renderPage({ focusId: 'o1', focusTs: 3 })
    expect(await screen.findByRole('dialog', { name: 'Rénovation Dupont' })).toBeInTheDocument()
  })
})

describe('CrmV — ajout rapide', () => {
  it('un nom + Entrée crée une affaire en Prospect et ouvre sa fiche', async () => {
    const user = userEvent.setup()
    crmDb.upsertOpportunite.mockResolvedValue({ id: 'o9', titre: 'Extension Leroy' })
    renderPage()
    await screen.findByText('Rénovation Dupont')
    const input = screen.getByRole('textbox', { name: /Ajouter une affaire rapidement/ })
    await user.type(input, 'Extension Leroy{Enter}')
    await waitFor(() => expect(crmDb.upsertOpportunite).toHaveBeenCalledWith({ titre: 'Extension Leroy', etape: 'Prospect' }))
    expect(addToast).toHaveBeenCalledWith('Affaire « Extension Leroy » ajoutée', 'success')
    expect(input).toHaveValue('')
  })

  it('première utilisation : affiche le guide en 3 étapes', async () => {
    crmDb.loadCrm.mockResolvedValue({ opportunites: [], interactions: [], missingMigration: false })
    renderPage()
    expect(await screen.findByText(/Bienvenue dans ton suivi commercial/)).toBeInTheDocument()
    expect(screen.getByText('Ajoute une affaire')).toBeInTheDocument()
  })
})

describe('CrmV — fiche affaire', () => {
  it('propose la prochaine étape et les boutons Gagnée / Perdue', async () => {
    const user = userEvent.setup()
    renderPage({ focusId: 'o1', focusTs: 9 })
    await screen.findByRole('dialog', { name: 'Rénovation Dupont' })
    // o1 est en « Qualifié » avec une relance en attente → bandeau relance
    expect(screen.getByText(/Relance prévue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gagnée/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Perdue$/ })).toBeInTheDocument()
    // Noter un appel : le sujet est pré-rempli avec le contact
    await user.click(screen.getByRole('button', { name: 'Noter Appel' }))
    expect(await screen.findByRole('dialog', { name: 'Noter un échange' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Appel avec SCI Dupont')).toBeInTheDocument()
  })
})

describe('CrmV — devis', () => {
  const base = {
    opportunites: [
      { id: 'o5', titre: 'Escalier extérieur', etape: 'Qualifié', montant_estime: 8000, probabilite: 30, contact_id: 'c1' },
    ],
    interactions: [],
    missingMigration: false,
  }

  it('« Qualifié » : Créer le devis ouvre l’éditeur pré-rempli puis enregistre le brouillon', async () => {
    const user = userEvent.setup()
    crmDb.loadCrm.mockResolvedValue({ ...base, devis: [] })
    crmDb.upsertDevis.mockResolvedValue({ id: 'd1', numero: 'DEV-2026-001' })
    renderPage({ focusId: 'o5', focusTs: 20 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    const editor = await screen.findByRole('dialog', { name: /^Devis DEV-\d{4}-001 · Escalier extérieur$/ })
    expect(editor).toBeInTheDocument()
    // Ligne pré-remplie au forfait avec le montant estimé
    expect(screen.getByLabelText('Prix unitaire HT ligne 1')).toHaveValue('8000')
    expect(screen.getByTestId('devis-totaux')).toHaveTextContent(/Total HT\s*8\s000,00\s€/)

    await user.click(screen.getByRole('button', { name: '+ Ligne' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ligne 2 : la désignation est requise.')

    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 2' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }))
    await waitFor(() => expect(crmDb.upsertDevis).toHaveBeenCalledWith(expect.objectContaining({
      opportunite_id: 'o5', statut: 'Brouillon', objet: 'Escalier extérieur',
    })))
    expect(addToast).toHaveBeenCalledWith('Devis DEV-2026-001 enregistré', 'success')
  })

  it('un devis envoyé peut être marqué accepté : l’affaire passe « Gagné » au montant du devis', async () => {
    const user = userEvent.setup()
    const d = { id: 'd1', opportunite_id: 'o5', numero: 'DEV-2026-001', statut: 'Envoyé', total_ht: 9500, total_ttc: 11400,
      date_emission: '2026-09-01', date_envoi: '2026-09-01', lignes: [] }
    crmDb.loadCrm.mockResolvedValue({ ...base, opportunites: [{ ...base.opportunites[0], etape: 'Devis envoyé' }], devis: [d] })
    crmDb.setDevisStatut.mockResolvedValue({ ...d, statut: 'Accepté' })
    crmDb.moveOpportunite.mockResolvedValue({})
    renderPage({ focusId: 'o5', focusTs: 21 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    expect(screen.getByText('DEV-2026-001')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '✓ Accepté' }))
    await waitFor(() => expect(crmDb.setDevisStatut).toHaveBeenCalledWith(d, 'Accepté'))
    await waitFor(() => expect(crmDb.moveOpportunite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o5', montant_estime: 9500 }), 'Gagné',
    ))
  })

  it('sans la migration 027, la section devis invite à l’appliquer', async () => {
    crmDb.loadCrm.mockResolvedValue({ ...base, devis: [], devisMissing: true })
    renderPage({ focusId: 'o5', focusTs: 22 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    expect(screen.getByText(/027_crm_devis\.sql/)).toBeInTheDocument()
    // Le bouton de l'étape retombe sur « → Devis envoyé »
    expect(screen.getByRole('button', { name: '→ Devis envoyé' })).toBeInTheDocument()
  })
})
