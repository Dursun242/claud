import { render, screen, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../lib/today', () => ({ ...jest.requireActual('../../../lib/today'), localISO: () => '2026-09-30' }))
const saveCr = jest.fn()
jest.mock('../../../lib/crDb', () => ({ saveCr: (...a) => saveCr(...a) }))
const store = { get: jest.fn(), set: jest.fn(), del: jest.fn() }
jest.mock('../../../lib/offlineStore', () => ({
  cacheGet: (...a) => store.get(...a), cacheSet: (...a) => store.set(...a), cacheDelete: (...a) => store.del(...a),
}))
jest.mock('../../../lib/crPhotos', () => ({ signedUrls: async () => ({}), loadCrImages: async () => ({}), photoFromFile: async () => ({ dataUrl: 'data:x' }) }))
const apiPost = jest.fn()
jest.mock('../../../lib/crmApi', () => ({ apiPost: (...a) => apiPost(...a) }))

// eslint-disable-next-line import/first
import CREditor from '../CREditor'

const CH = 'ch-1'
const data = {
  chantiers: [{ id: CH, nom: 'Villa Dupont', client: 'M. Dupont', lots: ['Électricité', 'Plomberie'] }],
  contacts: [{ id: 'c2', nom: 'Martin', societe: 'Martin Élec', email: 'martin@ex.fr' }],
  ordresService: [{ chantier_id: CH, artisan_nom: 'Martin', artisan_specialite: 'Électricité' }],
  contactChantiers: [], planning: [],
  compteRendus: [{ id: 'cr-2', chantier_id: CH, numero: 2, date: '2026-09-23',
    sections: [{ lot: 'Électricité', entreprise: 'Martin Élec', avancement: 30 }],
    intervenants: [{ nom: 'Martin', societe: 'Martin Élec', email: 'martin@ex.fr', convoque: true }] }],
  tasks: [
    { id: 't-late', chantier_id: CH, titre: 'Poser le tableau', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-25', entreprise: 'Martin Élec', lot: 'Électricité', num_point: 1, nb_rappels: 1 },
    { id: 't-ok', chantier_id: CH, titre: 'Réseaux sous dallage', statut: 'Planifié', priorite: 'En cours', echeance: '2026-10-10', lot: 'Plomberie', num_point: 2 },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  store.get.mockResolvedValue(undefined)
  store.set.mockResolvedValue(undefined)
})

function setup(props = {}) {
  const onSaved = jest.fn()
  const onClose = jest.fn()
  const user = userEvent.setup()
  render(<CREditor open initial={{ chantierId: CH }} data={data} onClose={onClose} onSaved={onSaved} m={false} lockChantier {...props} />)
  return { onSaved, onClose, user }
}
const section = (name) => screen.getByRole('region', { name })

it('rédaction : CR suivant, sections par lot, points repris', async () => {
  setup()
  expect(screen.getByText(/CR n°3 · Villa Dupont/)).toBeInTheDocument()
  expect(screen.getByText('Fait suite au CR n°2 du 23/09/2026')).toBeInTheDocument()
  const elec = section('Électricité')
  expect(within(elec).getByLabelText('Entreprise du lot Électricité')).toHaveValue('Martin Élec')
  expect(within(elec).getByText('CR précédent : 30 %')).toBeInTheDocument()
  const point = within(elec).getByTestId('cr-point')
  expect(within(point).getByText('n°1')).toBeInTheDocument()
  expect(within(point).getByRole('radio', { name: /À relancer/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(point).getByText('rappel n°2')).toBeInTheDocument()
  expect(within(section('Plomberie')).getAllByTestId('cr-point')).toHaveLength(1)
  expect(within(screen.getByRole('navigation', { name: 'Sommaire du compte rendu' })).getByRole('button', { name: /Électricité/ })).toBeInTheDocument()
})

it('valide, ajoute un point, renseigne l’avancement puis enregistre', async () => {
  saveCr.mockResolvedValue({ cr: { id: 'cr-3', numero: 3 }, snapshot: [], migrationMissing: false, failures: [], photoFailures: [] })
  const { onSaved, user } = setup()
  const plomberie = section('Plomberie')
  await user.click(within(plomberie).getByRole('radio', { name: /Fait/ }))
  await user.click(within(plomberie).getByRole('button', { name: /Nouveau point — Plomberie/ }))
  const added = within(plomberie).getAllByTestId('cr-point')[1]
  await user.type(within(added).getByLabelText('Point'), 'Fournir les PV d’essais')
  const av = within(section('Électricité')).getByLabelText('Avancement du lot Électricité en %')
  await user.clear(av)
  await user.type(av, '45')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'cr-3', numero: 3 }, { send: false }))
  const arg = saveCr.mock.calls[0][0]
  expect(arg.form).toMatchObject({ chantierId: CH, numero: 3, statut: 'Brouillon' })
  expect(arg.nextNum).toBe(3)
  expect(arg.rows.find(r => r.id === 't-ok').suivi).toBe('fait')
  expect(arg.rows.find(r => r.isNew)).toMatchObject({ titre: 'Fournir les PV d’essais', lot: 'Plomberie' })
  expect(arg.sections.find(s => s.lot === 'Électricité').avancement).toBe(45)
})

it('réunion : une étape à la fois, puis enregistrer et diffuser', async () => {
  saveCr.mockResolvedValue({ cr: { id: 'cr-3', numero: 3 }, snapshot: [], migrationMissing: false, failures: [], photoFailures: [] })
  const { onSaved, user } = setup({ m: true })
  expect(screen.getByRole('region', { name: 'Présences' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Électricité' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: /Électricité/ }))
  expect(screen.getByRole('region', { name: 'Électricité' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Plomberie →/ }))
  await user.click(screen.getByRole('button', { name: /Synthèse et convocation →/ }))
  expect(screen.getByLabelText('Date de la prochaine réunion')).toHaveValue('2026-10-07')
  await user.click(screen.getByRole('button', { name: 'Enregistrer et diffuser' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'cr-3', numero: 3 }, { send: true }))
})

it('dictée + IA : proposition validée puis ajoutée', async () => {
  apiPost.mockResolvedValue({ ok: true, data: {
    resume: 'Réunion tenue.', decisions: '',
    lots: [{ lot: 'Électricité', observations: 'Tableau absent.', avancement: 35 }],
    points_existants: [{ id: 't-ok', etat: 'fait', echeance: null }],
    nouveaux_points: [
      { lot: 'Électricité', titre: 'Fournir le schéma unifilaire', entreprise: 'Martin Élec', echeance: '2026-10-07', priorite: 'Urgent' },
      { lot: 'Plomberie', titre: 'Point refusé', entreprise: '', echeance: null, priorite: 'En cours' },
    ],
  } })
  const { user } = setup()
  await user.type(screen.getByLabelText('Notes de réunion'), 'Électricité tableau absent, schéma à fournir. Plomberie terminé.')
  await user.click(screen.getByRole('button', { name: /Ranger avec l’IA/ }))
  const proposal = await screen.findByRole('region', { name: "Proposition de l'IA" })
  expect(apiPost).toHaveBeenCalledWith('/api/cr/ia', expect.objectContaining({
    date: '2026-09-30', context: expect.objectContaining({ points: expect.arrayContaining([expect.objectContaining({ id: 't-late' })]) }),
  }))
  await user.click(within(proposal).getByRole('checkbox', { name: /Point refusé/ }))
  await user.click(within(proposal).getByRole('button', { name: 'Ajouter au compte rendu' }))

  const elec = section('Électricité')
  expect(within(elec).getByLabelText('Observations Électricité')).toHaveValue('Tableau absent.')
  expect(within(elec).getByLabelText('Avancement du lot Électricité en %')).toHaveValue(35)
  expect(within(elec).getAllByTestId('cr-point')).toHaveLength(2)
  expect(screen.queryByDisplayValue('Point refusé')).not.toBeInTheDocument()
  expect(within(section('Plomberie')).getByRole('radio', { name: /Fait/ })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByLabelText('Synthèse de la réunion')).toHaveValue('Réunion tenue.')
})

it('brouillon local proposé à la réouverture', async () => {
  store.get.mockResolvedValue({ savedAt: Date.UTC(2026, 8, 30, 10, 0), form: { chantierId: CH, numero: 3, date: '2026-09-30', intervenants: [], prochaine_reunion: {} }, rows: [], sections: [{ key: 'generalites', lot: 'Généralités', observations: 'Repris du brouillon', photos: [] }], notes: 'notes dictées' })
  const { user } = setup()
  expect(store.get).toHaveBeenCalledWith('cr-draft:new:ch-1')
  await user.click(await screen.findByRole('button', { name: 'Reprendre' }))
  expect(screen.getByLabelText('Notes de réunion')).toHaveValue('notes dictées')
  expect(screen.getByLabelText('Observations Généralités')).toHaveValue('Repris du brouillon')
})

it('brouillon enregistré sur l’appareil pendant la saisie', async () => {
  jest.useFakeTimers()
  try {
    render(<CREditor open initial={{ chantierId: CH }} data={data} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.type(screen.getByLabelText('Observations Généralités'), 'Sécurité OK')
    await act(async () => { jest.advanceTimersByTime(1500) })
    expect(store.set).toHaveBeenCalledWith('cr-draft:new:ch-1', expect.objectContaining({
      sections: expect.arrayContaining([expect.objectContaining({ observations: 'Sécurité OK' })]),
    }))
  } finally {
    jest.useRealTimers()
  }
})

it('refuse une prochaine réunion antérieure au CR', async () => {
  const { user } = setup()
  const next = screen.getByLabelText('Date de la prochaine réunion')
  await user.clear(next)
  await user.type(next, '2026-09-29')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('La prochaine réunion doit être après la date du CR.')
  expect(saveCr).not.toHaveBeenCalled()
})
