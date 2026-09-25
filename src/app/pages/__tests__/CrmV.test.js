import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true) }))
jest.mock('../../supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) } },
}))
jest.mock('../../generators', () => ({
  generateDevisPdf: jest.fn().mockResolvedValue({ base64: 'data:application/pdf;base64,JVBERi0=', filename: '26-050.pdf' }),
}))
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
    crmDb.upsertDevis.mockResolvedValue({ id: 'd1', numero: '26-050' })
    global.fetch = jest.fn(async (url, opts) => {
      const { action } = JSON.parse(opts.body)
      return { ok: true, status: 200, json: async () => ({ ok: true, data: action === 'numbers' ? { numbers: [] }
        : { devis: { id: 'd1', numero: '26-050', qonto_quote_id: 'qq1' }, qontoNumber: '26-050', renumbered: null, mismatch: null, created: true } }) }
    })
    renderPage({ focusId: 'o5', focusTs: 20 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    const editor = await screen.findByRole('dialog', { name: /^Devis \d{2}-\d{3} · Escalier extérieur$/ })
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
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Devis 26-050 enregistré dans l’application et dans Qonto', 'success'))
    expect(global.fetch).toHaveBeenCalledWith('/api/devis/qonto', expect.objectContaining({ body: JSON.stringify({ action: 'sync', devisId: 'd1' }) }))
    delete global.fetch
  })

  it('l’enregistrement signale clairement un devis non créé dans Qonto', async () => {
    const user = userEvent.setup()
    crmDb.loadCrm.mockResolvedValue({ ...base, devis: [] })
    crmDb.upsertDevis.mockResolvedValue({ id: 'd1', numero: '26-050' })
    global.fetch = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({
      error: 'Appliquer la migration 028_crm_devis_qonto.sql sur Supabase pour enregistrer les devis dans Qonto.', code: 'MIGRATION_028',
    }) }))
    renderPage({ focusId: 'o5', focusTs: 23 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le brouillon' }))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/^Devis 26-050 enregistré dans l’application mais PAS dans Qonto : Appliquer la migration 028/), 'error',
    ))
    delete global.fetch
  })

  it('numéro déjà pris dans Qonto à l’enregistrement : l’éditeur reste ouvert avec le message', async () => {
    const user = userEvent.setup()
    crmDb.loadCrm.mockResolvedValue({ ...base, devis: [] })
    crmDb.upsertDevis.mockResolvedValue({ id: 'd1', numero: '26-050', opportunite_id: 'o5', statut: 'Brouillon', lignes: [] })
    global.fetch = jest.fn(async (url, opts) => (JSON.parse(opts.body).action === 'numbers'
      ? { ok: true, status: 200, json: async () => ({ ok: true, data: { numbers: [] } }) }
      : { ok: false, status: 409, json: async () => ({ error: 'Le numéro 26-050 existe déjà dans Qonto. Prochain numéro libre : 26-062', code: 'NUMBER_TAKEN' }) }))
    renderPage({ focusId: 'o5', focusTs: 24 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le brouillon' }))
    expect(await screen.findByText(/Prochain numéro libre : 26-062/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /^Devis 26-050/ })).toBeInTheDocument()
    delete global.fetch
  })

  it('un devis envoyé peut être marqué accepté : l’affaire passe « Gagné » au montant du devis', async () => {
    const user = userEvent.setup()
    const d = { id: 'd1', opportunite_id: 'o5', numero: '26-050', statut: 'Envoyé', total_ht: 9500, total_ttc: 11400,
      date_emission: '2026-09-01', date_envoi: '2026-09-01', lignes: [] }
    crmDb.loadCrm.mockResolvedValue({ ...base, opportunites: [{ ...base.opportunites[0], etape: 'Devis envoyé' }], devis: [d] })
    crmDb.setDevisStatut.mockResolvedValue({ ...d, statut: 'Accepté' })
    crmDb.moveOpportunite.mockResolvedValue({})
    renderPage({ focusId: 'o5', focusTs: 21 })
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    expect(screen.getByText('26-050')).toBeInTheDocument()
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

describe('CrmV — envoi par mail et IA', () => {
  const opp = { id: 'o5', titre: 'Escalier extérieur', etape: 'Qualifié', montant_estime: 8000, probabilite: 30, contact_id: 'c2' }
  const contacts = [{ id: 'c2', nom: 'Cousin', type: 'Client', email: 'cousin@exemple.fr' }]
  const draft = { id: 'd1', opportunite_id: 'o5', numero: '26-050', statut: 'Brouillon', total_ht: 8000, total_ttc: 8800,
    date_emission: '2026-09-24', date_validite: '2026-10-24', objet: 'Escalier',
    lignes: [{ type: 'ligne', designation: 'Escalier', unite: 'forfait', quantite: 1, prix_unitaire: 8000, tva_taux: 10 }] }

  const renderWith = (extra = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    return render(
      <QueryClientProvider client={client}>
        <CrmV data={{ chantiers: [], contacts }} m={false} reload={jest.fn()} setTab={jest.fn()} focusId="o5" focusTs={30} {...extra} />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    crmDb.loadCrm.mockResolvedValue({ opportunites: [opp], interactions: [], devis: [draft], missingMigration: false })
    crmDb.setDevisStatut.mockResolvedValue({ ...draft, statut: 'Envoyé' })
    crmDb.moveOpportunite.mockResolvedValue({})
    crmDb.upsertInteraction.mockResolvedValue({})
    // Réponses par route ; Qonto non connecté par défaut
    routes = {
      '/api/devis/qonto': () => ({ ok: false, status: 503, json: async () => ({ error: 'Qonto non connecté', code: 'QONTO_NOT_CONFIGURED' }) }),
    }
    global.fetch = jest.fn(async (url, opts) => {
      const r = routes[url]
      if (!r) throw new Error(`fetch inattendu : ${url}`)
      return r(JSON.parse(opts.body))
    })
  })
  afterEach(() => { delete global.fetch })
  let routes
  const reply = (body, status = 200) => () => ({ ok: status < 300, status, json: async () => body })
  const callsTo = (url) => global.fetch.mock.calls.filter(([u]) => u === url).map(([, o]) => ({ ...o, body: JSON.parse(o.body) }))

  it('envoie le devis par mail depuis l’app puis le passe « Envoyé »', async () => {
    const user = userEvent.setup()
    routes['/api/devis/send'] = reply({ ok: true, to: ['cousin@exemple.fr'] })
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: '📤 Envoyer' }))
    const dlg = await screen.findByRole('dialog', { name: 'Envoyer le devis 26-050' })
    expect(dlg).toBeInTheDocument()
    expect(screen.getByLabelText('Destinataire')).toHaveValue('cousin@exemple.fr')
    expect(screen.getByDisplayValue('Devis 26-050 — Escalier')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '📤 Envoyer le devis' }))
    await waitFor(() => expect(crmDb.setDevisStatut).toHaveBeenCalledWith(draft, 'Envoyé'))
    const [opts] = callsTo('/api/devis/send')
    expect(opts.headers.Authorization).toBe('Bearer tok')
    expect(opts.body).toMatchObject({ to: 'cousin@exemple.fr', subject: 'Devis 26-050 — Escalier', filename: '26-050.pdf' })
    expect(crmDb.moveOpportunite).toHaveBeenCalledWith(expect.objectContaining({ id: 'o5' }), 'Devis envoyé', { montant_estime: 8000 })
    expect(addToast).toHaveBeenCalledWith('Devis 26-050 envoyé à cousin@exemple.fr · relance dans 7 jours', 'success')
  })

  it('affiche l’erreur serveur dans la fenêtre sans marquer le devis envoyé', async () => {
    const user = userEvent.setup()
    routes['/api/devis/send'] = reply({ error: 'L’envoi a échoué — vérifie la configuration SMTP.' }, 502)
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: '📤 Envoyer' }))
    await user.click(await screen.findByRole('button', { name: '📤 Envoyer le devis' }))
    expect(await screen.findByText(/vérifie la configuration SMTP/)).toBeInTheDocument()
    expect(crmDb.setDevisStatut).not.toHaveBeenCalled()
  })

  it('l’IA propose les lignes du devis à partir d’une description', async () => {
    const user = userEvent.setup()
    crmDb.loadCrm.mockResolvedValue({ opportunites: [opp], interactions: [], devis: [], missingMigration: false })
    routes['/api/devis-ia'] = reply({ ok: true, data: {
      objet: 'Escalier béton extérieur',
      lignes: [{ type: 'ligne', designation: 'Démolition escalier existant', unite: 'forfait', quantite: '1', prix_unitaire: '950', tva_taux: '10' }],
      conseils: ['Vérifier la nature du sol'],
    } })
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    await user.click(await screen.findByRole('button', { name: /Rédiger avec l’IA/ }))
    await user.type(screen.getByLabelText("Description du besoin pour l'IA"), 'Escalier béton 6 marches')
    await user.click(screen.getByRole('button', { name: 'Remplacer les lignes' }))
    expect(await screen.findByDisplayValue('Démolition escalier existant')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Escalier béton extérieur')).toBeInTheDocument()
    expect(screen.getByText('Vérifier la nature du sol')).toBeInTheDocument()
    const [{ body }] = callsTo('/api/devis-ia')
    expect(body).toMatchObject({ action: 'generate', description: 'Escalier béton 6 marches' })
    expect(body.context.affaire.titre).toBe('Escalier extérieur')
  })
  it('l’envoi enregistre d’abord le devis dans Qonto (numéro repris dans le mail)', async () => {
    const user = userEvent.setup()
    routes['/api/devis/qonto'] = ({ action }) => (action === 'numbers'
      ? reply({ ok: true, data: { numbers: ['26-049'] } })()
      : reply({ ok: true, data: { devis: { ...draft, numero: '26-051', qonto_quote_id: 'qq1' }, qontoNumber: '26-051', renumbered: '26-051', mismatch: null, created: true } })())
    routes['/api/devis/send'] = reply({ ok: true, to: ['cousin@exemple.fr'] })
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: '📤 Envoyer' }))
    await user.click(await screen.findByRole('button', { name: '📤 Envoyer le devis' }))
    await waitFor(() => expect(crmDb.setDevisStatut).toHaveBeenCalled())
    expect(callsTo('/api/devis/qonto').map(c => c.body)).toContainEqual({ action: 'sync', devisId: 'd1' })
    const [send] = callsTo('/api/devis/send')
    expect(send.body).toMatchObject({ subject: 'Devis 26-051 — Escalier' })
    const { generateDevisPdf } = require('../../generators')
    expect(generateDevisPdf).toHaveBeenLastCalledWith(expect.objectContaining({ numero: '26-051' }), expect.anything())
  })

  it('numéro déjà pris dans Qonto : l’envoi est bloqué avec le message', async () => {
    const user = userEvent.setup()
    routes['/api/devis/qonto'] = ({ action }) => (action === 'numbers'
      ? reply({ ok: true, data: { numbers: [] } })()
      : reply({ error: 'Le numéro 26-050 existe déjà dans Qonto. Prochain numéro libre : 26-062', code: 'NUMBER_TAKEN' }, 409)())
    routes['/api/devis/send'] = reply({ ok: true })
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: '📤 Envoyer' }))
    await user.click(await screen.findByRole('button', { name: '📤 Envoyer le devis' }))
    expect(await screen.findByText(/Prochain numéro libre : 26-062/)).toBeInTheDocument()
    expect(callsTo('/api/devis/send')).toHaveLength(0)
    expect(crmDb.setDevisStatut).not.toHaveBeenCalled()
  })

  it('bouton Qonto : crée le devis dans Qonto', async () => {
    const user = userEvent.setup()
    routes['/api/devis/qonto'] = ({ action }) => (action === 'numbers'
      ? reply({ ok: true, data: { numbers: [] } })()
      : reply({ ok: true, data: { devis: { ...draft, qonto_quote_id: 'qq1' }, qontoNumber: '26-050', renumbered: null, mismatch: null, created: true } })())
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await user.click(screen.getByRole('button', { name: '↗ Qonto' }))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('Devis 26-050 enregistré dans Qonto', 'success'))
  })

  it('la numérotation d’un nouveau devis suit les numéros Qonto', async () => {
    const user = userEvent.setup()
    crmDb.loadCrm.mockResolvedValue({ opportunites: [opp], interactions: [], devis: [], missingMigration: false })
    routes['/api/devis/qonto'] = reply({ ok: true, data: { numbers: ['26-070', '25-900'] } })
    renderWith()
    await screen.findByRole('dialog', { name: 'Escalier extérieur' })
    await waitFor(() => expect(callsTo('/api/devis/qonto')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: /Créer le devis/ }))
    const yy = String(new Date().getFullYear()).slice(-2)
    if (yy === '26') expect(await screen.findByRole('dialog', { name: /Devis 26-071/ })).toBeInTheDocument()
  })
})
