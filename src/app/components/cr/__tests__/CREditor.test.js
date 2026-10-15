import { render, screen, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../lib/today', () => ({ ...jest.requireActual('../../../lib/today'), localISO: () => '2026-09-30' }))
let confirmFn = null
jest.mock('../../../contexts/ConfirmContext', () => ({ useOptionalConfirm: () => confirmFn }))
const saveCr = jest.fn()
const markMiseEnDemeure = jest.fn()
jest.mock('../../../lib/crDb', () => ({ saveCr: (...a) => saveCr(...a), markMiseEnDemeure: (...a) => markMiseEnDemeure(...a) }))
const store = { get: jest.fn(), set: jest.fn(), del: jest.fn() }
jest.mock('../../../lib/offlineStore', () => ({
  cacheGet: (...a) => store.get(...a), cacheSet: (...a) => store.set(...a), cacheDelete: (...a) => store.del(...a),
}))
jest.mock('../../../lib/crPhotos', () => ({ signedUrls: async () => ({}), loadCrImages: async () => ({}), photoFromFile: async () => ({ dataUrl: 'data:x' }) }))
const apiPost = jest.fn()
jest.mock('../../../lib/crmApi', () => ({ apiPost: (...a) => apiPost(...a) }))
const generateCRPdf = jest.fn()
const generateMiseEnDemeurePdf = jest.fn()
jest.mock('../../../generators', () => ({ generateCRPdf: (...a) => generateCRPdf(...a), generateMiseEnDemeurePdf: (...a) => generateMiseEnDemeurePdf(...a) }))

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
  confirmFn = null
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
// Tablette / ordinateur : étapes Présences, Réunion, Clôture ; lots repliés
const goStep = (user, name) => user.click(screen.getByRole('tab', { name: new RegExp(name) }))
async function openLot(user, name) {
  const header = within(section(name)).getAllByRole('button')[0]
  if (header.getAttribute('aria-expanded') !== 'true') await user.click(header)
  return section(name)
}

it('tablette : trois étapes, lots repliés sur une ligne, points repris', async () => {
  const { user } = setup()
  expect(screen.getByText(/CR n°3 · Villa Dupont/)).toBeInTheDocument()
  // Étape 1 : présences
  expect(screen.getByRole('tab', { name: /Présences/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('Fait suite au CR n°2 du 23/09/2026')).toBeInTheDocument()
  expect(section('Présences')).toBeInTheDocument()
  expect(screen.queryByRole('radiogroup', { name: 'Mode de saisie' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Continuer : Réunion →' }))
  // Étape 2 : lots repliés, résumé sur la ligne
  expect(screen.getByRole('tab', { name: /Réunion/ })).toHaveAttribute('aria-selected', 'true')
  expect(within(section('Électricité')).getByText('1 à relancer')).toBeInTheDocument()
  expect(within(section('Électricité')).queryByTestId('cr-point')).not.toBeInTheDocument()
  const elec = await openLot(user, 'Électricité')
  expect(within(elec).getByLabelText('Entreprise du lot Électricité')).toHaveValue('Martin Élec')
  expect(within(elec).getByText(/précédent 30 %/)).toBeInTheDocument()
  const point = within(elec).getByTestId('cr-point')
  expect(within(point).getByText('n°1')).toBeInTheDocument()
  expect(within(point).getByRole('radio', { name: /À relancer/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(point).getByText('rappel n°2')).toBeInTheDocument()
  // Détail du point au clic sur son libellé
  expect(within(point).queryByLabelText('Échéance')).not.toBeInTheDocument()
  await user.click(within(point).getByRole('button', { name: 'Poser le tableau' }))
  expect(within(point).getByLabelText('Échéance')).toHaveValue('2026-09-25')
  expect(within(await openLot(user, 'Plomberie')).getAllByTestId('cr-point')).toHaveLength(1)
})

it('valide, ajoute un point, renseigne l’avancement puis enregistre', async () => {
  saveCr.mockResolvedValue({ cr: { id: 'cr-3', numero: 3 }, snapshot: [], migrationMissing: false, failures: [], photoFailures: [] })
  const { onSaved, user } = setup()
  await goStep(user, 'Réunion')
  const plomberie = await openLot(user, 'Plomberie')
  await openLot(user, 'Électricité')
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
  await goStep(user, 'Réunion')
  await user.type(screen.getByLabelText('Notes de réunion'), 'Électricité tableau absent, schéma à fournir. Plomberie terminé.')
  // Rangement lancé depuis la barre du bas (micro de dictée)
  await user.click(screen.getAllByRole('button', { name: 'Ranger avec l’IA' }).at(-1))
  const proposal = await screen.findByRole('region', { name: "Proposition de l'IA" })
  expect(apiPost).toHaveBeenCalledWith('/api/cr/ia', expect.objectContaining({
    date: '2026-09-30', context: expect.objectContaining({ points: expect.arrayContaining([expect.objectContaining({ id: 't-late' })]) }),
  }))
  await user.click(within(proposal).getByRole('checkbox', { name: /Point refusé/ }))
  await user.click(within(proposal).getByRole('button', { name: 'Ajouter au compte rendu' }))

  const elec = await openLot(user, 'Électricité')
  expect(within(elec).getByLabelText('Observations Électricité')).toHaveValue('Tableau absent.')
  expect(within(elec).getByLabelText('Avancement du lot Électricité en %')).toHaveValue(35)
  expect(within(elec).getAllByTestId('cr-point')).toHaveLength(2)
  expect(screen.queryByText('Point refusé')).not.toBeInTheDocument()
  expect(within(await openLot(user, 'Plomberie')).getByRole('radio', { name: /Fait/ })).toHaveAttribute('aria-checked', 'true')
  await goStep(user, 'Clôture')
  expect(screen.getByLabelText('Synthèse de la réunion')).toHaveValue('Réunion tenue.')
})

it('nouveau CR : brouillon de l’appareil repris automatiquement', async () => {
  store.get.mockResolvedValue({ savedAt: Date.UTC(2026, 8, 30, 10, 0), form: { chantierId: CH, numero: 3, date: '2026-09-30', intervenants: [], prochaine_reunion: {} }, rows: [], sections: [{ key: 'generalites', lot: 'Généralités', observations: 'Repris du brouillon', photos: [] }], notes: 'notes dictées' })
  const { user } = setup()
  expect(store.get).toHaveBeenCalledWith('cr-draft:new:ch-1')
  expect(await screen.findByText(/Ton travail non enregistré sur cet appareil a été repris/)).toBeInTheDocument()
  await goStep(user, 'Réunion')
  expect(screen.getByLabelText('Notes de réunion')).toHaveValue('notes dictées')
  await openLot(user, 'Généralités')
  expect(screen.getByLabelText('Observations Généralités')).toHaveValue('Repris du brouillon')
})

it('CR enregistré plus récent que le brouillon : brouillon seulement proposé', async () => {
  const cr = { id: 'cr-3-0000000000', chantierId: CH, numero: 3, date: '2026-09-30', sections: [], taches_suivi: [], enregistre_le: '2026-09-30T12:00:00Z' }
  store.get.mockResolvedValue({ savedAt: Date.UTC(2026, 8, 30, 10, 0), form: { ...cr }, rows: [], sections: [{ key: 'generalites', lot: 'Généralités', observations: 'Ancien brouillon', photos: [] }], notes: 'vieux' })
  const user = userEvent.setup()
  render(<CREditor open initial={cr} data={data} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
  await user.click(await screen.findByRole('button', { name: 'Reprendre' }))
  await goStep(user, 'Réunion')
  await openLot(user, 'Généralités')
  expect(screen.getByLabelText('Observations Généralités')).toHaveValue('Ancien brouillon')
})

it('reprise d’un CR : les notes déjà rangées restent, seules les nouvelles sont analysées puis enregistrées', async () => {
  const cr = { id: 'cr-3-0000000000', chantierId: CH, numero: 3, date: '2026-09-30', sections: [], taches_suivi: [],
    notes_dictee: 'Électricité : tableau posé, rien à signaler.', notes_rangees: 44 }
  apiPost.mockResolvedValue({ data: { resume: 'Plomberie en retard', decisions: '', lots: [], points_existants: [], nouveaux_points: [] } })
  saveCr.mockResolvedValue({ cr: { ...cr }, snapshot: [], failures: [], photoFailures: [], migrationMissing: false })
  const user = userEvent.setup()
  render(<CREditor open initial={cr} data={data} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
  await goStep(user, 'Réunion')
  expect(screen.getByText(/Notes déjà rangées dans le compte rendu/)).toBeInTheDocument()
  const nouvelles = screen.getByLabelText('Nouvelles notes de réunion')
  expect(nouvelles).toHaveValue('')
  await user.type(nouvelles, 'Plomberie : le réseau a pris du retard.')
  await user.click(screen.getByRole('button', { name: 'Ranger les nouvelles notes avec l’IA' }))
  expect(apiPost).toHaveBeenCalledWith('/api/cr/ia', expect.objectContaining({ notes: 'Plomberie : le réseau a pris du retard.' }))
  await user.click(await screen.findByRole('button', { name: 'Ajouter au compte rendu' }))
  // Tout est rangé : la zone des nouvelles notes est vide, l'historique reste
  expect(screen.getByLabelText('Nouvelles notes de réunion')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(saveCr).toHaveBeenCalled())
  const arg = saveCr.mock.calls[0][0]
  expect(arg.notes).toBe('Électricité : tableau posé, rien à signaler.\nPlomberie : le réseau a pris du retard.')
  expect(arg.notesRangees).toBe(arg.notes.length)
})

it('brouillon enregistré sur l’appareil pendant la saisie', async () => {
  jest.useFakeTimers()
  try {
    render(<CREditor open initial={{ chantierId: CH }} data={data} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await goStep(user, 'Réunion')
    const gen = await openLot(user, 'Généralités')
    await user.click(within(gen).getByRole('button', { name: '+ Observations' }))
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
  await goStep(user, 'Clôture')
  const next = screen.getByLabelText('Date de la prochaine réunion')
  await user.clear(next)
  await user.type(next, '2026-09-29')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('La prochaine réunion doit être après la date du CR.')
  expect(saveCr).not.toHaveBeenCalled()
})

it('aperçu à côté : le PDF se refait après les modifications', async () => {
  generateCRPdf.mockResolvedValue({ url: 'blob:apercu', filename: 'CR.pdf' })
  window.localStorage.removeItem('cr-apercu-a-cote')
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Aperçu à côté' }))
  const panel = screen.getByRole('complementary', { name: 'Aperçu du PDF' })
  await waitFor(() => expect(generateCRPdf).toHaveBeenCalled(), { timeout: 3000 })
  const [cr, , opts] = generateCRPdf.mock.calls.at(-1)
  expect(cr.numero).toBeTruthy()
  expect(opts.returnBlobUrl).toBe(true)
  expect(await within(panel).findByTitle('Aperçu du compte rendu')).toHaveAttribute('src', 'blob:apercu#view=FitH')
  // Choix gardé sur l'appareil, étapes toujours là
  expect(window.localStorage.getItem('cr-apercu-a-cote')).toBe('1')
  expect(screen.getByRole('tablist', { name: 'Étapes du compte rendu' })).toBeInTheDocument()
  await user.click(within(panel).getByRole('button', { name: "Fermer l'aperçu" }))
  expect(screen.queryByRole('complementary', { name: 'Aperçu du PDF' })).not.toBeInTheDocument()
  expect(window.localStorage.getItem('cr-apercu-a-cote')).toBe('0')
})

it('contrôle avant diffusion : questions listées, diffusion confirmée', async () => {
  saveCr.mockResolvedValue({ cr: { id: 'cr-3', numero: 3 }, snapshot: [], migrationMissing: false, failures: [], photoFailures: [] })
  confirmFn = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { onSaved, user } = setup()
  expect(screen.getByRole('tab', { name: /Clôture.*2 à vérifier/ })).toBeInTheDocument()
  await goStep(user, 'Clôture')
  const panel = screen.getByRole('region', { name: 'À vérifier avant diffusion' })
  // Points repris dont personne n'a parlé : réponse rapide
  expect(within(panel).getByText('Point n°1 « Poser le tableau » (Martin Élec) n\'a pas été évoqué : où en est-il ?')).toBeInTheDocument()
  await user.click(within(panel).getByRole('button', { name: /^À relancer : Point n°1/ }))
  await user.click(within(panel).getByRole('button', { name: /^En cours : Point n°2/ }))
  expect(within(panel).queryByText(/n'a pas été évoqué/)).not.toBeInTheDocument()
  expect(within(panel).getByText('Point n°2 « Réseaux sous dallage » : quelle entreprise ?')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /Clôture.*1 à vérifier/ })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Diffuser' }))
  expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ title: '1 point à vérifier', confirmLabel: 'Diffuser quand même' }))
  expect(saveCr).not.toHaveBeenCalled()
  // « Compléter » mène au point à compléter
  expect(screen.getByRole('tab', { name: /Réunion/ })).toHaveAttribute('aria-selected', 'true')
  expect(within(section('Plomberie')).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
  await user.click(screen.getByRole('button', { name: 'Diffuser' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'cr-3', numero: 3 }, { send: true }))
  // L'enregistrement simple ne demande rien
  await user.click(await screen.findByRole('button', { name: 'Enregistrer' }))
  expect(confirmFn).toHaveBeenCalledTimes(2)
  // Le point réglé depuis la clôture l'est aussi dans son lot
  await goStep(user, 'Réunion')
  expect(within(await openLot(user, 'Électricité')).getByRole('radio', { name: /À relancer/ })).toHaveAttribute('aria-checked', 'true')
})

it('alertes : champ dans la synthèse, proposées par l’IA', async () => {
  apiPost.mockResolvedValue({ ok: true, data: {
    resume: '', alertes: 'Retard de 2 semaines du lot électricité.', decisions: '', lots: [], points_existants: [], nouveaux_points: [],
  } })
  const { user } = setup()
  await goStep(user, 'Réunion')
  await user.type(screen.getByLabelText('Notes de réunion'), 'Électricité deux semaines de retard.')
  await user.click(within(section('Dictée de la réunion')).getByRole('button', { name: 'Ranger avec l’IA' }))
  const proposal = await screen.findByRole('region', { name: "Proposition de l'IA" })
  await user.click(within(proposal).getByRole('button', { name: 'Ajouter au compte rendu' }))
  await goStep(user, 'Clôture')
  expect(screen.getByLabelText('Alertes : retards, non-conformités, risques')).toHaveValue('Retard de 2 semaines du lot électricité.')
})

it('ordre du jour : retards, planning, OS récents, documents', async () => {
  const d = {
    ...data,
    planning: [{ chantier_id: CH, lot: 'Électricité', debut: '2026-09-01', fin: '2026-10-01' }],
    ordresService: [...data.ordresService, { id: 'os-9', chantier_id: CH, numero: 'OS-009', artisan_nom: 'Durand', artisan_specialite: 'Plomberie', date_emission: '2026-09-26' }],
    contacts: [...data.contacts, { id: 'c3', nom: 'Durand', type: 'Artisan', societe: 'Durand Plomberie' }],
  }
  const conformite = { docs: [], today: '2026-09-30', legal: [] }
  const user = userEvent.setup()
  render(<CREditor open initial={{ chantierId: CH }} data={d} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier conformite={conformite} />)
  await goStep(user, 'Réunion')
  expect(screen.getByText('À aborder pendant la réunion (4)')).toBeInTheDocument()
  const agenda = screen.getByRole('region', { name: 'Ordre du jour' })
  expect(within(agenda).getByText('n°1 Poser le tableau · Martin Élec · 5 j de retard · déjà relancé 1 fois')).toBeInTheDocument()
  expect(within(agenda).getByText('Électricité (Martin Élec) : prévu 97 %, 30 % au dernier CR')).toBeInTheDocument()
  expect(within(agenda).getByText('Émis le 26/09/2026 : OS-009 · Durand · Plomberie')).toBeInTheDocument()
  expect(within(agenda).getByText(/^Durand : À fournir/)).toBeInTheDocument()
})

it('réponse de l’entreprise par son lien : affichée sous le point, point pré-rempli', async () => {
  const d = { ...data, tasks: data.tasks.map(t => (t.id === 't-late' ? { ...t, reponse_entreprise: { type: 'fait', commentaire: 'Tableau posé', le: '2026-09-28T09:00:00Z' } } : t)) }
  const user = userEvent.setup()
  render(<CREditor open initial={{ chantierId: CH }} data={d} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
  await goStep(user, 'Réunion')
  expect(within(section('Électricité')).getByText('1 réponse reçue')).toBeInTheDocument()
  const point = within(await openLot(user, 'Électricité')).getByTestId('cr-point')
  expect(within(point).getByRole('note')).toHaveTextContent('Réponse de l\'entreprise le 28/09/2026 : Fait — « Tableau posé »')
  expect(within(point).getByRole('radio', { name: /Fait/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(screen.getByRole('region', { name: 'Ordre du jour' })).getByText('n°1 Poser le tableau · Martin Élec : Fait — « Tableau posé »')).toBeInTheDocument()
})

it('3e relance sans effet : courrier de mise en demeure proposé et préparé', async () => {
  markMiseEnDemeure.mockResolvedValue(true)
  generateMiseEnDemeurePdf.mockResolvedValue({ filename: 'x.pdf' })
  const d = { ...data, tasks: data.tasks.map(t => (t.id === 't-late' ? { ...t, nb_rappels: 2 } : t)),
    contacts: [...data.contacts.map(c => ({ ...c, adresse: '2 rue Neuve', code_postal: '76600', ville: 'Le Havre' }))] }
  const user = userEvent.setup()
  render(<CREditor open initial={{ chantierId: CH }} data={d} onClose={jest.fn()} onSaved={jest.fn()} m={false} lockChantier />)
  await goStep(user, 'Clôture')
  expect(within(screen.getByRole('region', { name: 'À vérifier avant diffusion' })).getByText('Martin Élec : relancé 3 fois sans effet, place au courrier de mise en demeure.')).toBeInTheDocument()
  await goStep(user, 'Réunion')
  const point = within(await openLot(user, 'Électricité')).getByTestId('cr-point')
  expect(within(point).getByText('Relancé 3 fois sans effet : place à la mise en demeure.')).toBeInTheDocument()
  await user.click(within(point).getByRole('button', { name: 'Préparer la mise en demeure' }))
  const dialog = screen.getByRole('dialog', { name: 'Mise en demeure — Martin Élec' })
  expect(within(dialog).getByRole('checkbox', { name: /Poser le tableau/ })).toBeChecked()
  expect(within(dialog).getByLabelText('Email de l’entreprise')).toHaveValue('martin@ex.fr')
  await user.click(within(dialog).getByRole('button', { name: 'Télécharger le courrier (PDF)' }))
  await waitFor(() => expect(markMiseEnDemeure).toHaveBeenCalledWith(['t-late'], expect.objectContaining({ entreprise: 'Martin Élec' })))
  const arg = generateMiseEnDemeurePdf.mock.calls[0][0]
  expect(arg.dest).toMatchObject({ nom: 'Martin Élec', lignes: ['2 rue Neuve', '76600 Le Havre'] })
  expect(arg.text.points[0]).toMatch(/^Point n°1 : Poser le tableau, attendu pour le 25\/09\/2026, relancé 3 fois\.$/)
  expect(await screen.findByRole('button', { name: 'Refaire le courrier' })).toBeInTheDocument()
})

it('lots : modifier l’ordre, renommer, supprimer', async () => {
  confirmFn = jest.fn().mockResolvedValue(true)
  const { user } = setup()
  await goStep(user, 'Réunion')
  const nav = section('Lots du compte rendu')
  await user.click(within(nav).getByRole('button', { name: 'Modifier les lots' }))
  const lots = () => within(nav).getAllByRole('listitem').map(li => li.textContent.replace(/[↑↓✎🗑·\d\s]+$/u, '').trim())
  expect(lots()).toEqual(['Électricité', 'Plomberie'])
  await user.click(within(nav).getByRole('button', { name: 'Monter Plomberie' }))
  expect(lots()).toEqual(['Plomberie', 'Électricité'])
  await user.click(within(nav).getByRole('button', { name: 'Renommer Électricité' }))
  const input = within(nav).getByLabelText('Nouveau nom du lot Électricité')
  await user.clear(input)
  await user.type(input, 'Électricité / VMC{Enter}')
  expect(lots()).toEqual(['Plomberie', 'Électricité / VMC'])
  await user.click(within(nav).getByRole('button', { name: 'Supprimer Plomberie' }))
  expect(confirmFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Supprimer le lot « Plomberie » ?' }))
  expect(lots()).toEqual(['Électricité / VMC'])
  await user.click(within(nav).getByRole('button', { name: 'Terminé' }))
  // Le point du lot supprimé est dans Généralités, celui de l'électricité suit le nouveau nom
  expect(within(await openLot(user, 'Généralités')).getAllByTestId('cr-point')).toHaveLength(1)
  expect(within(await openLot(user, 'Électricité / VMC')).getAllByTestId('cr-point')).toHaveLength(1)
})
