import { createRateLimiter, clientIp } from '../rateLimit'

describe('createRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('autorise jusqu à la limite puis refuse', () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 })
    expect(check('ip-1')).toBe(true)
    expect(check('ip-1')).toBe(true)
    expect(check('ip-1')).toBe(true)
    expect(check('ip-1')).toBe(false)
  })

  it('compte chaque clé indépendamment', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(check('ip-1')).toBe(true)
    expect(check('ip-2')).toBe(true)
    expect(check('ip-1')).toBe(false)
    expect(check('ip-2')).toBe(false)
  })

  it('réautorise après expiration de la fenêtre', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 })
    expect(check('ip-1')).toBe(true)
    expect(check('ip-1')).toBe(false)
    jest.advanceTimersByTime(60_001)
    expect(check('ip-1')).toBe(true)
  })

  it('purge les entrées expirées quand maxEntries est atteint', () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000, maxEntries: 2 })
    expect(check('ip-1')).toBe(true)
    expect(check('ip-2')).toBe(true)
    // Map pleine d'entrées encore valides → refus des nouvelles clés
    expect(check('ip-3')).toBe(false)
    // Après expiration, la purge libère la place
    jest.advanceTimersByTime(60_001)
    expect(check('ip-3')).toBe(true)
  })
})

describe('clientIp', () => {
  const makeRequest = (headers) => ({
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  })

  it('extrait la première IP de x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(clientIp(req)).toBe('1.2.3.4')
  })

  it('retourne unknown sans header', () => {
    expect(clientIp(makeRequest({}))).toBe('unknown')
  })
})
