import { render, screen } from '@testing-library/react'
import DevisList from '../DevisList'

const noop = () => {}
const base = { id: 'd1', numero: 'D-2026-040', statut: 'Envoyé', total_ht: 9050, total_ttc: 10860, date_emission: '2026-09-29', date_envoi: '2026-09-29', lignes: [] }
const props = { onNew: noop, onOpen: noop, onPdf: noop, onSend: noop, onAccept: noop, onRefuse: noop, onDuplicate: noop, onDelete: noop }

describe('DevisList — suivi', () => {
  it('affiche ouvertures du mail et consultations en ligne, détail au survol', () => {
    const _suivi = {
      ouvertures: 3, consultations: 1,
      derniereOuverture: '2026-09-29T08:12:00Z', derniereConsultation: '2026-09-29T08:15:00Z',
      events: [{ kind: 'consultation', created_at: '2026-09-29T08:15:00Z' }, { kind: 'ouverture', created_at: '2026-09-29T08:12:00Z' }],
    }
    render(<DevisList devis={[{ ...base, _suivi }]} {...props} />)
    const line = screen.getByText(/ouvert 3×/).parentElement
    expect(line).toHaveTextContent('👁 ouvert 3× · dernier le 29/09 10:12')
    expect(line).toHaveTextContent('🔗 consulté en ligne 1×')
    expect(line.getAttribute('title')).toMatch(/29\/09 10:15 — devis consulté en ligne\n29\/09 10:12 — mail ouvert/)
  })

  it('rien sans suivi', () => {
    render(<DevisList devis={[base]} {...props} />)
    expect(screen.queryByText(/ouvert \d+×/)).not.toBeInTheDocument()
  })
})

describe('DevisList — renvoi', () => {
  it('devis envoyé non signé : bouton « Renvoyer » qui rouvre l’envoi', () => {
    const onSend = jest.fn()
    render(<DevisList devis={[{ ...base, statut_signature: 'Envoyé' }]} {...props} onSend={onSend} />)
    screen.getByRole('button', { name: '↻ Renvoyer' }).click()
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }))
  })

  it('pas de renvoi une fois signé, ni pour un brouillon (bouton Envoyer)', () => {
    const { rerender } = render(<DevisList devis={[{ ...base, statut_signature: 'Signé' }]} {...props} />)
    expect(screen.queryByRole('button', { name: '↻ Renvoyer' })).not.toBeInTheDocument()
    rerender(<DevisList devis={[{ ...base, statut: 'Brouillon' }]} {...props} />)
    expect(screen.queryByRole('button', { name: '↻ Renvoyer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📤 Envoyer' })).toBeInTheDocument()
  })
})

describe('DevisList — relance avec choix de réponse', () => {
  it('bouton « Relancer » sur un devis envoyé non signé', () => {
    const onRelance = jest.fn()
    const { rerender } = render(<DevisList devis={[base]} {...props} onRelance={onRelance} />)
    screen.getByRole('button', { name: '✉ Relancer' }).click()
    expect(onRelance).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }))
    rerender(<DevisList devis={[{ ...base, statut_signature: 'Signé' }]} {...props} onRelance={onRelance} />)
    expect(screen.queryByRole('button', { name: '✉ Relancer' })).not.toBeInTheDocument()
    rerender(<DevisList devis={[{ ...base, statut: 'Accepté' }]} {...props} onRelance={onRelance} />)
    expect(screen.queryByRole('button', { name: '✉ Relancer' })).not.toBeInTheDocument()
  })

  it('relances et dernière réponse du client affichées', () => {
    const _suivi = {
      ouvertures: 0, consultations: 0, relances: 2, derniereRelance: '2026-10-01T08:00:00Z',
      reponses: [{ raison: 'reporte', commentaire: 'au printemps', created_at: '2026-10-02T09:30:00Z' }],
      events: [],
    }
    render(<DevisList devis={[{ ...base, _suivi }]} {...props} />)
    expect(screen.getByText(/relancé 2×/)).toHaveTextContent('✉ relancé 2× · dernière le 01/10 10:00')
    expect(screen.getByText(/Réponse du client/).parentElement).toHaveTextContent('💬 Réponse du client le 02/10 11:30 : Projet reporté — « au printemps »')
  })
})
