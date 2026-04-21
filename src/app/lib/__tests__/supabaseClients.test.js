import { extractBearerToken } from '../supabaseClients'

// Helper : construit une fausse Request-like avec des headers consultables
// via `.get(name)`. On ne veut pas charger le vrai WHATWG Request (lourd en
// jsdom) ni Next.js — tout ce qu'utilise extractBearerToken est `.get()`.
function fakeRequest(headers = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  )
  return {
    headers: {
      get: (name) => lower[name.toLowerCase()] ?? null,
    },
  }
}

describe('extractBearerToken', () => {
  it("renvoie null si aucun header Authorization n'est présent", () => {
    expect(extractBearerToken(fakeRequest({}))).toBeNull()
  })

  it('extrait le JWT d\'un header "Bearer <token>"', () => {
    expect(extractBearerToken(fakeRequest({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi')
  })

  it('accepte la casse "Authorization" (majuscule)', () => {
    expect(extractBearerToken(fakeRequest({ Authorization: 'Bearer tok' }))).toBe('tok')
  })

  it('accepte "bearer" en minuscule (RFC 6750 § 2.1 : insensible à la casse)', () => {
    expect(extractBearerToken(fakeRequest({ authorization: 'bearer tok' }))).toBe('tok')
  })

  it('renvoie null si le header ne commence pas par Bearer', () => {
    expect(extractBearerToken(fakeRequest({ authorization: 'Basic dXNlcjpwYXNz' }))).toBeNull()
  })

  it('gère les espaces multiples entre "Bearer" et le token', () => {
    expect(extractBearerToken(fakeRequest({ authorization: 'Bearer   my-token' }))).toBe('my-token')
  })
})
