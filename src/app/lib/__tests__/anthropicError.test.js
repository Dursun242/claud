import { describeAnthropicError } from '../anthropicError'

const body = (type, message) => JSON.stringify({ type: 'error', error: { type, message } })

describe('describeAnthropicError', () => {
  it.each([
    [400, body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), 502, /Crédit/],
    [400, body('invalid_request_error', 'messages.0.content.0.image.source.base64: image dimensions exceed max allowed size: 8000 pixels'), 422, /Image refusée/],
    [400, body('invalid_request_error', 'image exceeds 5 MB maximum: 5412345 bytes > 5242880 bytes'), 422, /Image refusée/],
    [401, body('authentication_error', 'invalid x-api-key'), 502, /Clé API/],
    [404, body('not_found_error', 'model: claude-x'), 502, /Modèle/],
    [413, 'Request Entity Too Large', 413, /trop volumineuse/],
    [429, body('rate_limit_error', 'Number of requests has exceeded'), 429, /Trop de demandes/],
    [529, body('overloaded_error', 'Overloaded'), 503, /surchargé/],
    [500, 'oops', 503, /surchargé/],
    [400, body('invalid_request_error', 'max_tokens: must be positive'), 502, /code 400/],
  ])('%i %s', (status, text, expectedStatus, re) => {
    const r = describeAnthropicError(status, text)
    expect(r.status).toBe(expectedStatus)
    expect(r.message).toMatch(re)
  })
})
