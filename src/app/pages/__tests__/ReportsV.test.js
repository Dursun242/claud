import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true) }))
// shared.js importe components/index.js qui ré-importe shared.js (cycle) :
// on mocke le strict nécessaire.
jest.mock('../../dashboards/shared', () => ({
  SB: { deleteCR: jest.fn() },
  fmtDate: (d) => String(d || ''),
  btnP: {},
}))
jest.mock('../../components', () => ({ EmptyState: ({ title }) => <div role="status">{title}</div> }))
jest.mock('../../components/cr/CREditor', () => function CREditor({ open }) {
  return open ? <div role="dialog" aria-label="Éditeur CR" /> : null
})
jest.mock('../../components/cr/CRSendModal', () => function CRSendModal({ cr, onSent }) {
  return cr ? <button onClick={() => onSent(cr)}>Simuler l&apos;envoi</button> : null
})
jest.mock('../../lib/crDb', () => ({ markDiffused: jest.fn() }))

// eslint-disable-next-line import/first
import { markDiffused } from '../../lib/crDb'
// eslint-disable-next-line import/first
import ReportsV from '../ReportsV'

const data = {
  chantiers: [{ id: 'ch1', nom: 'Maison Dupont' }],
  compteRendus: [{ id: 'cr1', numero: 1, date: '2026-10-01', statut: 'Brouillon', chantierId: 'ch1', resume: 'Point' }],
}

function renderPage(props = {}) {
  const reload = jest.fn()
  render(<ReportsV data={data} m={false} reload={reload} {...props} />)
  return { reload }
}

beforeEach(() => { addToast.mockClear(); markDiffused.mockReset() })

describe('ReportsV — raccourci « n »', () => {
  it('ouvre un nouveau CR quand l’onglet est actif', async () => {
    renderPage({ active: true })
    await userEvent.keyboard('n')
    expect(screen.getByRole('dialog', { name: 'Éditeur CR' })).toBeInTheDocument()
  })

  it('ignoré quand l’onglet est caché (active=false)', async () => {
    renderPage({ active: false })
    await userEvent.keyboard('n')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignoré en lecture seule (client)', async () => {
    renderPage({ readOnly: true, active: true })
    await userEvent.keyboard('n')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ReportsV — passage en « Diffusé »', () => {
  it('avertit si le statut ne peut pas passer à « Diffusé »', async () => {
    markDiffused.mockResolvedValue(false)
    const { reload } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Diffuser/ }))
    await userEvent.click(screen.getByRole('button', { name: /Simuler l'envoi/ }))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/Diffusé/), 'warning'))
    expect(markDiffused).toHaveBeenCalledWith('cr1')
    expect(reload).toHaveBeenCalled()
  })

  it('aucun avertissement si le passage réussit', async () => {
    markDiffused.mockResolvedValue(true)
    const { reload } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /Diffuser/ }))
    await userEvent.click(screen.getByRole('button', { name: /Simuler l'envoi/ }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(addToast).not.toHaveBeenCalledWith(expect.anything(), 'warning')
  })
})
