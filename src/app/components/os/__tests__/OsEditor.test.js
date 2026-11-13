import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../hooks/useChiffrage', () => ({ useChiffrage: () => ({ chiffrage: null, ready: true }) }))
const mockUpsertOS = jest.fn()
const mockUpdateOsStatut = jest.fn()
// shared.js importe components/index.js qui ré-importe shared.js (cycle) :
// on mocke le strict nécessaire plutôt que requireActual.
jest.mock('../../../dashboards/shared', () => {
  const { cloneElement, isValidElement } = require('react')
  return {
    SB: {
      upsertOS: (...a) => mockUpsertOS(...a),
      updateOsStatut: (...a) => mockUpdateOsStatut(...a),
      log: jest.fn(),
    },
    Icon: () => null,
    I: {},
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
  }
})
jest.mock('../../AddressPicker', () => function AddressPicker() { return null })
jest.mock('../../Modal', () => function Modal({ open, title, children }) {
  return open ? <div role="dialog" aria-label={title}>{children}</div> : null
})

import OsEditor from '../OsEditor'
import { newOsDraft } from '../../../lib/osRules'

const chantier = { id: 'c1', nom: 'Maison Martin', client: 'M. Martin', adresse: '1 rue A' }
const data = {
  chantiers: [chantier, { id: 'c2', nom: 'Bureaux', client: 'SCI B' }],
  contacts: [{ id: 'k1', nom: 'Durand Plomberie', type: 'Artisan', specialite: 'Plomberie', email: 'd@ex.fr', siret: '12345678900011' }],
  ordresService: [{ id: 'o1', numero: 'OS-2026-001', chantier_id: 'c1' }],
}

function renderNew(props = {}) {
  const draft = { form: newOsDraft({ chantier, allOs: data.ordresService }) }
  const onSaved = jest.fn()
  render(<OsEditor draft={draft} data={data} onClose={jest.fn()} onSaved={onSaved} {...props} />)
  return { onSaved }
}

beforeEach(() => {
  mockUpsertOS.mockReset().mockImplementation(async (os) => ({ ...os, id: 'new-id' }))
  mockUpdateOsStatut.mockReset().mockImplementation(async (id, statut) => ({ id, statut, numero: 'OS-2026-001' }))
  addToast.mockReset()
})

it("refuse d'enregistrer un OS sans entreprise ni prestation", async () => {
  renderNew()
  await userEvent.click(screen.getByRole('button', { name: "Enregistrer l'OS" }))
  expect(await screen.findByText(/Choisissez l'entreprise/)).toBeInTheDocument()
  expect(mockUpsertOS).not.toHaveBeenCalled()
})

it('enregistre les montants calculés, 0 % compris, sans les lignes vides', async () => {
  const { onSaved } = renderNew()
  await userEvent.selectOptions(screen.getByLabelText('Destinataire'), 'Durand Plomberie')
  await userEvent.type(screen.getByLabelText('Prestation 1 : description'), 'Réseau EU')
  await userEvent.type(screen.getByLabelText('Prestation 1 : quantité'), '2')
  await userEvent.type(screen.getByLabelText('Prestation 1 : prix unitaire HT'), '150')
  await userEvent.selectOptions(screen.getByLabelText('Prestation 1 : taux de TVA'), '0')
  await userEvent.click(screen.getByText('+ Ajouter une ligne'))
  await userEvent.click(screen.getByRole('button', { name: "Enregistrer l'OS" }))

  await waitFor(() => expect(mockUpsertOS).toHaveBeenCalledTimes(1))
  const saved = mockUpsertOS.mock.calls[0][0]
  expect(saved).toMatchObject({
    numero: 'OS-2026-002', chantier_id: 'c1', artisan_nom: 'Durand Plomberie',
    artisan_email: 'd@ex.fr', artisan_siret: '12345678900011',
    montant_ht: 300, montant_tva: 0, montant_ttc: 300,
  })
  expect(saved.prestations).toHaveLength(1)
  expect(onSaved).toHaveBeenCalled()
})

it('refuse un numéro déjà pris', async () => {
  renderNew()
  const numero = screen.getByLabelText('N° OS')
  await userEvent.clear(numero)
  await userEvent.type(numero, 'OS-2026-001')
  await userEvent.click(screen.getByRole('button', { name: "Enregistrer l'OS" }))
  expect(await screen.findByText(/déjà pris/)).toBeInTheDocument()
})

it('fiche chantier : le chantier ne se change pas', () => {
  renderNew({ lockChantier: true })
  expect(screen.getByLabelText('Chantier')).toBeDisabled()
})

it("OS signé : contenu figé, seul le statut s'enregistre", async () => {
  const os = {
    id: 'o1', numero: 'OS-2026-001', chantier_id: 'c1', statut: 'Signé', statut_signature: 'Signé',
    artisan_nom: 'Durand Plomberie', date_emission: '2026-11-01',
    prestations: [{ description: 'Réseau EU', unite: 'u', quantite: 2, prix_unitaire: 150, tva_taux: 20 }],
  }
  const onSaved = jest.fn()
  render(<OsEditor os={os} data={data} onClose={jest.fn()} onSaved={onSaved} />)
  expect(screen.getByText(/contenu est figé/)).toBeInTheDocument()
  expect(screen.getByLabelText('Prestation 1 : description')).toBeDisabled()
  expect(screen.getByLabelText('N° OS')).toBeDisabled()
  const statut = screen.getByLabelText('Statut')
  expect([...statut.options].map(o => o.value)).toEqual(['Signé', 'En cours', 'Annulé'])
  await userEvent.selectOptions(statut, 'En cours')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le statut' }))
  await waitFor(() => expect(mockUpdateOsStatut).toHaveBeenCalledWith('o1', 'En cours', 'OS-2026-001'))
  expect(mockUpsertOS).not.toHaveBeenCalled()
  expect(onSaved).toHaveBeenCalled()
})
