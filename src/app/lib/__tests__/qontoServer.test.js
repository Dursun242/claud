/**
 * @jest-environment node
 */
jest.mock('../fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))
const { fetchWithRetry } = require('../fetchWithRetry')
const { pushQuoteStatus, deleteQuote } = require('../qontoServer')

const res = (status, body) => ({ ok: status < 300, status, text: async () => (body ? JSON.stringify(body) : '') })

beforeEach(() => fetchWithRetry.mockReset())

describe('qontoServer', () => {
  it('pushQuoteStatus : appliqué si Qonto renvoie le nouveau statut', async () => {
    fetchWithRetry.mockResolvedValueOnce(res(200, { quote: { id: 'q1', status: 'approved' } }))
    expect(await pushQuoteStatus('tok', 'q1', 'Accepté')).toMatchObject({ applied: true })
    const [url, opts] = fetchWithRetry.mock.calls[0]
    expect(url).toBe('https://thirdparty.qonto.com/v2/quotes/q1')
    expect(opts).toMatchObject({ method: 'PATCH', maxRetries: 0 })
    expect(JSON.parse(opts.body)).toEqual({ status: 'approved' })
  })

  it('pushQuoteStatus : non appliqué si Qonto ignore ou refuse ; rien sans token / statut inconnu', async () => {
    fetchWithRetry.mockResolvedValueOnce(res(200, { quote: { id: 'q1', status: 'pending_approval' } }))
    expect((await pushQuoteStatus('tok', 'q1', 'Refusé')).applied).toBe(false)
    fetchWithRetry.mockResolvedValueOnce(res(422, { errors: [{ detail: 'status is not permitted' }] }))
    expect((await pushQuoteStatus('tok', 'q1', 'Accepté')).applied).toBe(false)
    expect((await pushQuoteStatus(null, 'q1', 'Accepté')).applied).toBe(false)
    expect((await pushQuoteStatus('tok', 'q1', 'Brouillon')).applied).toBe(false)
    expect(fetchWithRetry).toHaveBeenCalledTimes(2)
  })

  it('deleteQuote : supprimé (ou déjà absent) ; refus avec détail', async () => {
    fetchWithRetry.mockResolvedValueOnce(res(204))
    expect(await deleteQuote('tok', 'q1')).toEqual({ deleted: true })
    fetchWithRetry.mockResolvedValueOnce(res(404, { message: 'not found' }))
    expect(await deleteQuote('tok', 'q1')).toEqual({ deleted: true })
    fetchWithRetry.mockResolvedValueOnce(res(422, { errors: [{ detail: 'approved quotes cannot be deleted' }] }))
    expect(await deleteQuote('tok', 'q1')).toMatchObject({ deleted: false, detail: 'approved quotes cannot be deleted' })
  })
})
