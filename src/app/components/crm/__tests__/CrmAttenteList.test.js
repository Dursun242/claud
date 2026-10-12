import { render, screen } from '@testing-library/react'
import CrmAttenteList from '../CrmAttenteList'

const contacts = new Map([['c1', { id: 'c1', nom: 'M. Leroy' }]])

describe('CrmAttenteList', () => {
  it('reprise dépassée en rouge, mail de reprise déjà envoyé signalé', () => {
    render(<CrmAttenteList today="2026-10-12" contactsById={contacts} onOpen={() => {}} list={[
      { id: 'a', titre: 'Maison Leroy', etape: 'En attente', contact_id: 'c1', motif_attente: 'Projet reporté', date_reprise: '2026-10-01' },
      { id: 'b', titre: 'Extension Leroy', etape: 'En attente', contact_id: 'c1', date_reprise: '2026-10-05', reprise_envoyee_le: '2026-10-05' },
    ]} />)
    expect(screen.getByText('À reprendre depuis 11 j')).toBeInTheDocument()
    expect(screen.getByText(/Mail de reprise envoyé le .*, en attente de réponse/)).toBeInTheDocument()
    // Seule l'affaire sans mail parti compte « à reprendre maintenant »
    expect(screen.getByText('1 à reprendre maintenant')).toBeInTheDocument()
  })
})
