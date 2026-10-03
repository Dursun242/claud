import { act, renderHook, waitFor } from '@testing-library/react'

const addToast = jest.fn()
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
jest.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => jest.fn().mockResolvedValue(true) }))
jest.mock('../../supabaseClient', () => ({ supabase: {} }))
jest.mock('../../dashboards/shared', () => ({ COMPANY: { nom: 'ID Maîtrise' } }))
jest.mock('../../components/crm/DevisEditor', () => ({ fmtEur: (n) => `${n} €` }))
jest.mock('../../components/crm/DevisList', () => ({ qontoState: () => 'ok' }))
jest.mock('../../lib/crmApi', () => ({
  apiPost: jest.fn(), saveBase64Pdf: jest.fn(), openBase64Pdf: jest.fn(),
}))
jest.mock('../../lib/crmDb', () => ({
  moveOpportunite: jest.fn(), upsertInteraction: jest.fn(), upsertDevis: jest.fn(),
  setDevisStatut: jest.fn(), deleteDevis: jest.fn(),
}))

// eslint-disable-next-line import/first
import { useCrmDevis } from '../useCrmDevis'
// eslint-disable-next-line import/first
import { apiPost } from '../../lib/crmApi'
// eslint-disable-next-line import/first
import * as crmDb from '../../lib/crmDb'

const devis = { id: 'd1', numero: '26-050', opportunite_id: 'o1', statut: 'Brouillon', lignes: [], qonto_quote_id: 'qq1' }
const opp = { id: 'o1', titre: 'Escalier', etape: 'Qualifié', contact_id: 'c1' }

function setup() {
  const reload = jest.fn().mockResolvedValue()
  const props = {
    crm: { devis: [devis] }, opportunites: [opp], interactions: [],
    contactsById: new Map([['c1', { id: 'c1', nom: 'Cousin', email: 'cousin@exemple.fr' }]]),
    reload, setSaving: jest.fn(), changeEtape: jest.fn(),
  }
  const { result } = renderHook(() => useCrmDevis(props))
  return { result, reload }
}

beforeEach(() => {
  jest.clearAllMocks()
  apiPost.mockImplementation(async (path, body) => {
    if (path === '/api/devis/qonto' && body.action === 'pdf') return { data: { base64: 'JVBERi0=', filename: '26-050.pdf' } }
    if (path === '/api/devis/qonto') return { data: { quotes: [] } }
    return { data: { ok: true } }
  })
})

describe('useCrmDevis — envoi par mail', () => {
  it('mail parti mais statut non mis à jour : avertit sans proposer de renvoi', async () => {
    crmDb.setDevisStatut.mockRejectedValue(new Error('RLS denied'))
    const { result, reload } = setup()
    await act(async () => { await result.current.prepareSend(devis) })
    await waitFor(() => expect(result.current.sendState?.status).toBe('ready'))

    await act(async () => {
      await result.current.submitSend({ to: 'cousin@exemple.fr', subject: 'Devis', body: '…', sign: false })
    })

    expect(apiPost).toHaveBeenCalledWith('/api/devis/send', expect.objectContaining({ to: 'cousin@exemple.fr' }))
    // Fenêtre fermée : pas d'erreur d'envoi affichée, pas de bouton « Envoyer » à recliquer
    expect(result.current.sendState).toBeNull()
    expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/^Mail envoyé, mais statut du devis non mis à jour : à corriger à la main/), 'warning', 10000)
    expect(addToast).not.toHaveBeenCalledWith(expect.anything(), 'success')
    expect(reload).toHaveBeenCalled()
  })

  it('échec de l’envoi du mail : erreur dans la fenêtre, statut inchangé', async () => {
    apiPost.mockImplementation(async (path, body) => {
      if (path === '/api/devis/send') throw new Error('SMTP indisponible')
      if (path === '/api/devis/qonto' && body.action === 'pdf') return { data: { base64: 'JVBERi0=', filename: '26-050.pdf' } }
      return { data: { quotes: [] } }
    })
    const { result } = setup()
    await act(async () => { await result.current.prepareSend(devis) })
    await waitFor(() => expect(result.current.sendState?.status).toBe('ready'))

    await act(async () => {
      await result.current.submitSend({ to: 'cousin@exemple.fr', subject: 'Devis', body: '…', sign: false })
    })

    expect(result.current.sendState.error).toBe('SMTP indisponible')
    expect(crmDb.setDevisStatut).not.toHaveBeenCalled()
  })
})
