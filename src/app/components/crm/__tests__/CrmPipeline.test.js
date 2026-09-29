import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../dashboards/shared', () => ({
  btnS: {},
  fmtMoney: (n) => `${Number(n) || 0} €`,
}))
jest.mock('../../index', () => ({
  EmptyState: ({ title }) => <div role="status">{title}</div>,
}))

// eslint-disable-next-line import/first
import CrmPipeline from '../CrmPipeline'
// eslint-disable-next-line import/first
import { groupByEtape } from '../../../lib/crm'

const opps = [
  { id: 'o1', titre: 'Maison Dupont', etape: 'Prospect', montant_estime: 1000 },
  { id: 'o2', titre: 'Extension Martin', etape: 'Qualifié', montant_estime: 0 },
]

function setup(props = {}) {
  const handlers = { onOpen: jest.fn(), onCall: jest.fn(), onMove: jest.fn(), onNew: jest.fn(), onSelectStage: jest.fn() }
  render(
    <CrmPipeline m={false} grouped={groupByEtape(opps)} stage={null} contactsById={new Map()} interactions={[]}
      {...handlers} {...props} />,
  )
  return handlers
}

describe('CrmPipeline (desktop)', () => {
  it('glisser une carte sur une autre colonne change son étape', () => {
    const { onMove } = setup()
    fireEvent.dragStart(screen.getByRole('button', { name: 'Ouvrir Maison Dupont' }))
    const cible = screen.getByText('Devis envoyé').closest('div').parentElement
    fireEvent.dragOver(cible)
    fireEvent.drop(cible)
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'Devis envoyé')
  })

  it('un dépôt sans carte glissée ne fait rien', () => {
    const { onMove } = setup()
    fireEvent.drop(screen.getByText('Négociation').closest('div').parentElement)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('boutons de carte : ouvrir, noter un appel, avancer, ajouter dans une colonne', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('button', { name: 'Ouvrir Maison Dupont' }))
    expect(h.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
    await user.click(screen.getByRole('button', { name: 'Noter un appel pour Maison Dupont' }))
    expect(h.onCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
    await user.click(screen.getByRole('button', { name: 'Passer à Qualifié' }))
    expect(h.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'Qualifié')
    await user.click(screen.getByTitle('Nouvelle affaire directement en « Négociation »'))
    expect(h.onNew).toHaveBeenCalledWith('Négociation')
    // Les boutons de la carte n'ouvrent pas la fiche en plus
    expect(h.onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('CrmPipeline (mobile)', () => {
  it('affiche une étape à la fois et change d’étape via les pastilles', async () => {
    const user = userEvent.setup()
    const h = setup({ m: true, stage: 'Qualifié' })
    expect(screen.getByText('Extension Martin')).toBeInTheDocument()
    expect(screen.queryByText('Maison Dupont')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Prospect/ }))
    expect(h.onSelectStage).toHaveBeenCalledWith('Prospect')
    await user.click(screen.getByRole('button', { name: /Ajouter en « Qualifié »/ }))
    expect(h.onNew).toHaveBeenCalledWith('Qualifié')
  })
})
