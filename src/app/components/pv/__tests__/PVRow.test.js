import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PVRow from '../PVRow'

// Fixture minimaliste : un PV "type" qu'on peut étendre ponctuellement
// dans chaque test sans dupliquer tous les champs.
const basePv = {
  id: 'pv-1',
  numero: 'PV-2026-001',
  titre: 'Réception finale',
  date_reception: '2026-04-20',
  statut_signature: 'Signé',
  statut_reception: 'Accepté',
}

describe('PVRow', () => {
  it('affiche le numéro, le titre et la date', () => {
    render(<PVRow pv={basePv} onDetail={() => {}} />)

    expect(screen.getByText('PV-2026-001')).toBeInTheDocument()
    expect(screen.getByText(/Réception finale/)).toBeInTheDocument()
  })

  it('affiche les deux badges de statut (signature + décision)', () => {
    render(<PVRow pv={basePv} onDetail={() => {}} />)

    // Les badges incluent l'icône + le texte — on cherche un match partiel.
    expect(screen.getByText(/✓ Signé/)).toBeInTheDocument()
    expect(screen.getByText(/✓ Accepté/)).toBeInTheDocument()
  })

  it("invoque onDetail(pv) quand on clique sur la ligne", async () => {
    const onDetail = jest.fn()
    render(<PVRow pv={basePv} onDetail={onDetail} />)

    await userEvent.click(screen.getByRole('button'))

    expect(onDetail).toHaveBeenCalledTimes(1)
    expect(onDetail).toHaveBeenCalledWith(basePv)
  })

  it('adapte les badges quand le statut change', () => {
    const pvRefuse = { ...basePv, statut_signature: 'Refusé', statut_reception: 'En attente' }
    render(<PVRow pv={pvRefuse} onDetail={() => {}} />)

    expect(screen.getByText(/✕ Refusé/)).toBeInTheDocument()
    expect(screen.getByText(/⏳ En attente/)).toBeInTheDocument()
  })
})
