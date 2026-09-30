import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../dashboards/shared', () => ({
  FF: ({ label, hint, children }) => <label>{label}{children}{hint && <small>{hint}</small>}</label>,
  inp: {}, sel: {}, btnP: {}, btnS: {},
  fmtDate: (d) => (d ? d.split('-').reverse().join('/') : ''),
}))
jest.mock('../../index', () => ({
  Modal: ({ open, title, children }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}))
const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../lib/today', () => ({
  ...jest.requireActual('../../../lib/today'),
  localISO: () => '2026-09-30',
}))
const saveCr = jest.fn()
jest.mock('../../../lib/crDb', () => ({ saveCr: (...a) => saveCr(...a) }))

// eslint-disable-next-line import/first
import CRFormModal from '../CRFormModal'

const CH = 'ch-1'
const data = {
  chantiers: [{ id: CH, nom: 'Villa Dupont', client: 'M. Dupont', adresse: '3 rue du Port' }],
  contacts: [
    { id: 'c1', nom: 'M. Dupont', email: 'dupont@ex.fr' },
    { id: 'c2', nom: 'Martin', societe: 'Martin Élec', email: 'martin@ex.fr' },
  ],
  ordresService: [{ chantier_id: CH, artisan_nom: 'Martin', artisan_specialite: 'Électricité' }],
  contactChantiers: [],
  compteRendus: [
    { id: 'cr-1', chantier_id: CH, numero: 1, date: '2026-09-16' },
    { id: 'cr-2', chantier_id: CH, numero: 2, date: '2026-09-23',
      prochaine_reunion: { date: '2026-09-30', heure: '14:00', lieu: 'Base vie' },
      intervenants: [{ nom: 'Martin', societe: 'Martin Élec', email: 'martin@ex.fr', convoque: true }] },
  ],
  tasks: [
    { id: 't-late', chantier_id: CH, titre: 'Reprise enduit', statut: 'En cours', priorite: 'En cours', echeance: '2026-09-25', entreprise: 'Martin Élec', nb_rappels: 1 },
    { id: 't-ok', chantier_id: CH, titre: 'Pose tableau', statut: 'Planifié', priorite: 'En cours', echeance: '2026-10-10' },
  ],
}

beforeEach(() => { saveCr.mockReset(); addToast.mockReset() })

function setup(props = {}) {
  const onSaved = jest.fn()
  render(<CRFormModal open initial={{ chantierId: CH }} data={data} onClose={jest.fn()} onSaved={onSaved} m={false} {...props} />)
  return { onSaved, user: userEvent.setup() }
}

it('nouveau CR : numéro suivant, date et convocation reprises, convoqués pré-cochés, actions reprises', () => {
  setup()
  expect(screen.getByLabelText(/^N°/)).toHaveValue(3)
  expect(screen.getByText('Précédent : n°2 du 23/09/2026')).toBeInTheDocument()
  expect(screen.getByLabelText(/Date de la réunion/)).toHaveValue('2026-09-30')
  expect(screen.getByLabelText(/^Date$/)).toHaveValue('2026-10-07')
  expect(screen.getByLabelText(/^Heure$/)).toHaveValue('14:00')
  expect(screen.getByLabelText(/^Lieu$/)).toHaveValue('Base vie')

  // Martin (convoqué au CR 2) coché, M. Dupont (MOA) proposé mais pas coché
  expect(screen.getByRole('checkbox', { name: /Martin/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /M\. Dupont/ })).not.toBeChecked()

  const actions = screen.getAllByTestId('cr-action')
  expect(actions).toHaveLength(2)
  expect(within(actions[0]).getByRole('radio', { name: /À relancer/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(actions[0]).getByText('rappel n°2')).toBeInTheDocument()
  expect(within(actions[0]).getByText(/priorité relevée à « Urgente »/)).toBeInTheDocument()
  expect(within(actions[1]).getByRole('radio', { name: /En cours/ })).toHaveAttribute('aria-checked', 'true')
})

it('valide une action, en crée une nouvelle et enregistre puis propose l’envoi', async () => {
  const cr = { id: 'cr-3', numero: 3 }
  saveCr.mockResolvedValue({ cr, snapshot: [{ suivi: 'fait' }, { suivi: 'nouveau' }], migrationMissing: false, failures: [] })
  const { onSaved, user } = setup()

  const actions = screen.getAllByTestId('cr-action')
  await user.click(within(actions[1]).getByRole('radio', { name: /Fait/ }))
  await user.click(screen.getByRole('button', { name: '+ Nouvelle action' }))
  const added = screen.getAllByTestId('cr-action')[2]
  await user.type(within(added).getByLabelText('Action'), 'Fournir PV essais')
  await user.type(within(added).getByLabelText('Entreprise'), 'Martin Élec')
  await user.click(screen.getByRole('button', { name: 'Enregistrer et envoyer' }))

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(cr, { send: true }))
  const { form, rows } = saveCr.mock.calls[0][0]
  expect(form).toMatchObject({ chantierId: CH, numero: 3, date: '2026-09-30' })
  expect(rows.find(r => r.id === 't-ok').suivi).toBe('fait')
  expect(rows.find(r => r.isNew)).toMatchObject({ titre: 'Fournir PV essais', entreprise: 'Martin Élec', echeance: '2026-10-07' })
  expect(addToast).toHaveBeenCalledWith('CR n°3 créé — actions : 1 nouvelle, 1 soldée', 'success')
})

it('refuse une prochaine réunion antérieure au CR', async () => {
  const { user } = setup()
  const next = screen.getByLabelText(/^Date$/)
  await user.clear(next)
  await user.type(next, '2026-09-29')
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.getByRole('alert')).toHaveTextContent('La prochaine réunion doit être après la date du CR.')
  expect(saveCr).not.toHaveBeenCalled()
})

it('signale la migration manquante', async () => {
  saveCr.mockResolvedValue({ cr: { id: 'x', numero: 3 }, snapshot: [], migrationMissing: true, failures: [] })
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.stringContaining('migration 033'), 'warning'))
})

it('changer la date recalcule les retards sans perdre les saisies', async () => {
  const { user } = setup()
  const late = () => screen.getAllByTestId('cr-action').find(a => within(a).getByLabelText('Action').value === 'Reprise enduit')
  await user.clear(within(late()).getByLabelText('Entreprise'))
  await user.type(within(late()).getByLabelText('Entreprise'), 'Autre SARL')
  const date = screen.getByLabelText(/Date de la réunion/)
  await user.clear(date)
  await user.type(date, '2026-09-24')
  // Au 24/09, l'échéance du 25/09 n'est pas dépassée : « En cours », saisie conservée
  expect(within(late()).getByRole('radio', { name: /En cours/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(late()).getByLabelText('Entreprise')).toHaveValue('Autre SARL')
  expect(screen.getByLabelText(/^Date$/)).toHaveValue('2026-10-01')
})
