import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
const mockSave = jest.fn()
let mockState
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true), useOptionalConfirm: () => null }))
const mockUpload = jest.fn().mockResolvedValue({ error: null })
jest.mock('../../../supabaseClient', () => ({ supabase: { storage: { from: () => ({ uploadToSignedUrl: (...a) => mockUpload(...a) }) } } }))
jest.mock('../../../lib/conformiteClient', () => ({ prepareFile: async (f) => f }))
jest.mock('../../../hooks/useChiffrage', () => ({ useChiffrage: () => mockState }))
jest.mock('../../../lib/crmApi', () => ({ apiPost: jest.fn() }))

import ChiffrageSection from '../ChiffrageSection'
import ChiffrageEditor from '../ChiffrageEditor'
import ChiffrageCreateModal from '../ChiffrageCreateModal'
import { apiPost } from '../../../lib/crmApi'

const CHIFFRAGE = {
  chantier_id: 'c1', surface_m2: 100, aleas_pct: 0, tva_pct: 20, description: 'Maison',
  lots: [
    { id: 'l1', nom: 'Gros œuvre', postes: [{ id: 'p1', designation: 'Fondations', quantite: 1, unite: 'ens', pu_ht: 20000 }] },
    { id: 'l2', nom: 'Électricité', postes: [{ id: 'p2', designation: 'Installation', quantite: 1, unite: 'ens', pu_ht: 8000 }] },
  ],
}

beforeEach(() => { jest.clearAllMocks(); mockState = { chiffrage: CHIFFRAGE, ready: true, missingMigration: false, save: mockSave, remove: jest.fn() } })

describe('ChiffrageSection', () => {
  it('compare estimé / engagé par lot et signale les OS sans lot', () => {
    render(<ChiffrageSection chantier={{ id: 'c1', nom: 'Villa' }} os={[
      { lot: 'Gros œuvre', statut: 'Signé', montant_ht: 22000 },
      { lot: '', statut: 'Signé', montant_ht: 1500 },
    ]} />)
    const row = screen.getByText('Gros œuvre').closest('tr')
    expect(within(row).getByText(/1 OS/)).toBeInTheDocument()
    expect(within(row).getByText(/\+2\s000/)).toBeInTheDocument()
    expect(screen.getByText(/OS sans lot \(1\)/)).toBeInTheDocument()
    // Ratio TTC : 28 000 HT × 1,2 / 100 m²
    expect(screen.getByText('Ratio TTC/m²').parentElement.textContent).toMatch(/336\s€/)
  })

  it('relecture des prix par l’IA : remarques affichées avec leur impact', async () => {
    apiPost.mockResolvedValue({ data: { synthese: 'Niveau réaliste.', remarques: [{ type: 'oubli', poste: '', message: 'Dalle de toiture absente', impact_ht: 8000 }] } })
    render(<ChiffrageSection chantier={{ id: 'c1', nom: 'Villa' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier les prix (IA)' }))
    expect(await screen.findByText('Dalle de toiture absente')).toBeInTheDocument()
    expect(screen.getByText(/\+8\s000/)).toBeInTheDocument()
    expect(apiPost.mock.calls[0][1]).toMatchObject({ action: 'verifier', surface_m2: 100, lots: CHIFFRAGE.lots })
  })

  it('sans chiffrage : bouton de création ; migration absente : message', () => {
    mockState = { ...mockState, chiffrage: null }
    const { rerender } = render(<ChiffrageSection chantier={{ id: 'c1' }} />)
    expect(screen.getByRole('button', { name: /Créer le chiffrage/ })).toBeInTheDocument()
    mockState = { ...mockState, missingMigration: true }
    rerender(<ChiffrageSection chantier={{ id: 'c1' }} />)
    expect(screen.getByText(/migration 040/)).toBeInTheDocument()
  })
})

describe('ChiffrageEditor', () => {
  it('modifie un prix, recalcule et enregistre des lots propres', async () => {
    const onSave = jest.fn().mockResolvedValue()
    render(<ChiffrageEditor open initial={CHIFFRAGE} chantier={{ nom: 'Villa' }} onClose={jest.fn()} onSave={onSave} />)
    const pu = screen.getAllByLabelText('Prix unitaire HT')[1]
    // fireEvent : la modale déplace le focus à l'ouverture (frappe non déterministe)
    fireEvent.change(pu, { target: { value: '9000,5' } })
    expect(screen.getByTestId('chiffrage-totaux').textContent).toMatch(/29\s001/)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const saved = onSave.mock.calls[0][0]
    // Prix saisi à la main : verrouillé
    expect(saved.lots[1].postes[0]).toMatchObject({ designation: 'Installation', pu_ht: 9000.5, quantite: 1, verrou: true })
    expect(saved.lots[0].postes[0].verrou).toBeUndefined()
    expect(saved).toMatchObject({ description: 'Maison', tva_pct: '20' })
  })

  it('refuse un lot sans nom', async () => {
    const onSave = jest.fn()
    render(<ChiffrageEditor open initial={{ lots: [{ nom: '', postes: [{ designation: 'X', quantite: 1, pu_ht: 10 }] }] }} chantier={{}} onClose={jest.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith('Chaque lot doit avoir un nom', 'error')
  })
})

describe('ChiffrageEditor — prix des OS', () => {
  it('affiche le prix payé dans les OS et l’applique au clic', async () => {
    const onSave = jest.fn().mockResolvedValue()
    const refs = [{ designation: 'Installation', unite: 'ens', pu_ht: 8500, nb: 3, min: 8000, max: 9000, metier: 'Électricien' }]
    render(<ChiffrageEditor open initial={CHIFFRAGE} chantier={{}} refs={refs} onClose={jest.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /OS 8500 € ×3/ }))
    expect(screen.getAllByLabelText('Prix unitaire HT')[1].value).toBe('8500')
    expect(screen.getByRole('button', { name: /OS 8500 € ×3/ })).toBeDisabled()
  })
})

describe('ChiffrageCreateModal — depuis les plans', () => {
  it('dépose les plans, montre le métré à corriger puis chiffre avec ce métré', async () => {
    apiPost.mockImplementation(async (_url, body) => {
      if (body.action === 'prepare_plan') return { data: { path: `chiffrage-plans/c1/1__${body.name}`, token: 't', type: 'application/pdf' } }
      if (body.action === 'metre') return { data: { projet: 'Maison plain-pied', surface_m2: 110, alertes: ['Coupe absente'], metre: [{ element: 'Surface de toiture', quantite: 150.5, unite: 'm²', source: 'estimé' }] } }
      if (body.action === 'trame') return { data: { lots: [{ nom: 'Couverture', contenu: 'Toiture' }], metre_cle: [], surface_m2: 110, hypotheses: [], non_compris: [], conseils: [], ia: 'mistral' } }
      return { data: { postes: [{ id: 'p', designation: 'Tuiles', quantite: 160, unite: 'm²', pu_ht: 60 }], ia: 'mistral' } }
    })
    const onResult = jest.fn()
    render(<ChiffrageCreateModal open chantier={{ id: 'c1', nom: 'Villa', lots: [] }} allOs={[]} onClose={jest.fn()} onResult={onResult} />)
    const file = new File(['%PDF'], 'PCMI.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText(/Plans du permis/), { target: { files: [file] } })
    await userEvent.click(screen.getByRole('button', { name: 'Lire les plans' }))
    expect(mockUpload).toHaveBeenCalledWith('chiffrage-plans/c1/1__PCMI.pdf', 't', file, { contentType: 'application/pdf' })
    expect(await screen.findByText('Coupe absente')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '160' } })
    await userEvent.click(screen.getByRole('button', { name: 'Chiffrer avec les prix des OS' }))
    const trame = apiPost.mock.calls.find(c => c[1].action === 'trame')[1]
    expect(trame).toMatchObject({ description: 'Maison plain-pied', surface_m2: 110, metre: [{ element: 'Surface de toiture', quantite: '160', unite: 'm²', source: 'estimé' }] })
    const lot = apiPost.mock.calls.find(c => c[1].action === 'lot')[1]
    expect(lot).toMatchObject({ lot: { nom: 'Couverture', contenu: 'Toiture' }, metre: trame.metre })
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ source: 'plans', description: 'Maison plain-pied', lots: [{ nom: 'Couverture', postes: [expect.objectContaining({ designation: 'Tuiles' })] }] }))
    expect(addToast).toHaveBeenCalledWith('DPGF chiffré par Mistral : 1 lots, 1 postes', 'success')
  })
})

describe('ChiffrageEditor — honoraires et calage', () => {
  it('lot honoraires ajouté en tête ; calage des seuls prix libres sur l’objectif TTC', async () => {
    const onSave = jest.fn().mockResolvedValue()
    const initial = { ...CHIFFRAGE, lots: [CHIFFRAGE.lots[0], { ...CHIFFRAGE.lots[1], postes: [{ ...CHIFFRAGE.lots[1].postes[0], verrou: true }] }] }
    render(<ChiffrageEditor open initial={initial} chantier={{}} onClose={jest.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: '+ Lot honoraires MOE' }))
    expect(screen.getAllByLabelText('Nom du lot')[0].value).toBe("HONORAIRES MAÎTRISE D'ŒUVRE")
    // Travaux : 20 000 (libre) + 8 000 (verrouillé) ; objectif travaux 30 000 TTC = 25 000 HT → 17 000 libre
    fireEvent.change(screen.getByPlaceholderText('300 000'), { target: { value: '30 000' } })
    await userEvent.click(screen.getByRole('button', { name: 'Caler les prix libres' }))
    expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/^Calé : 30\s000\s€ TTC/), 'success')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.lots[0]).toMatchObject({ honoraires: true })
    expect(saved.lots.slice(1).map(l => l.postes[0].pu_ht)).toEqual([17000, 8000])
  })
})
