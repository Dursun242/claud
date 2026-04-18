import { fetchWithRetry } from '../fetchWithRetry'

// Mock global fetch pour chaque test — on simule les réponses/erreurs
// et on vérifie que le wrapper applique la bonne politique de retry.
const originalFetch = global.fetch

function mockResponse({ ok = true, status = 200, bodyText = '{}' } = {}) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(JSON.parse(bodyText || '{}')),
  })
}

describe('fetchWithRetry', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renvoie la réponse directement si elle est OK (pas de retry)', async () => {
    global.fetch = jest.fn().mockReturnValue(mockResponse({ ok: true, status: 200 }))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('ne retry JAMAIS sur un 4xx — renvoie la réponse telle quelle', async () => {
    global.fetch = jest.fn().mockReturnValue(mockResponse({ ok: false, status: 404 }))
    const res = await fetchWithRetry('https://example.com', { maxRetries: 3 })
    expect(res.status).toBe(404)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('ne retry JAMAIS sur un 401 (auth) — on ne veut pas se faire lock out', async () => {
    global.fetch = jest.fn().mockReturnValue(mockResponse({ ok: false, status: 401 }))
    const res = await fetchWithRetry('https://example.com', { maxRetries: 3 })
    expect(res.status).toBe(401)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('retry sur 5xx puis succès au 2e essai', async () => {
    global.fetch = jest.fn()
      .mockReturnValueOnce(mockResponse({ ok: false, status: 503 }))
      .mockReturnValueOnce(mockResponse({ ok: true, status: 200 }))
    const res = await fetchWithRetry('https://example.com', { maxRetries: 2 })
    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('abandonne après maxRetries tentatives 5xx successives', async () => {
    global.fetch = jest.fn().mockReturnValue(mockResponse({ ok: false, status: 502 }))
    const res = await fetchWithRetry('https://example.com', { maxRetries: 2 })
    expect(res.status).toBe(502)
    // 1 essai initial + 2 retries = 3
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('retry sur une erreur réseau (fetch throw) et finit par succéder', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockReturnValueOnce(mockResponse({ ok: true, status: 200 }))
    const res = await fetchWithRetry('https://example.com', { maxRetries: 2 })
    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('propage l erreur après épuisement des retries sur erreur réseau', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(
      fetchWithRetry('https://example.com', { maxRetries: 1 })
    ).rejects.toThrow('ECONNRESET')
    expect(global.fetch).toHaveBeenCalledTimes(2) // 1 + 1 retry
  })

  it('abort après timeoutMs si la requête est trop lente', async () => {
    // On simule un fetch qui répond selon le signal AbortController.
    global.fetch = jest.fn((url, options) => {
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    await expect(
      fetchWithRetry('https://example.com', { timeoutMs: 50, maxRetries: 0 })
    ).rejects.toThrow()
  }, 10000)

  it('passe les options fetch classiques (method, headers, body)', async () => {
    global.fetch = jest.fn().mockReturnValue(mockResponse({ ok: true, status: 201 }))
    await fetchWithRetry('https://example.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('https://example.com/api')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.body).toBe('{"hello":"world"}')
    // Un AbortSignal est injecté automatiquement
    expect(opts.signal).toBeDefined()
  })
})
