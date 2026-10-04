/**
 * @jest-environment node
 */
jest.mock('../fetchWithRetry', () => ({ fetchWithRetry: jest.fn() }))

// eslint-disable-next-line import/first
import { generate, providerOrder, describeMistralError, stripJsonFence } from '../ai'
// eslint-disable-next-line import/first
import { fetchWithRetry } from '../fetchWithRetry'

const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '' })
const err = (status, text) => ({ ok: false, status, json: async () => ({}), text: async () => text })
const anthropicReply = (text, stop = 'end_turn') => ok({ content: [{ type: 'text', text }], stop_reason: stop })
const mistralReply = (content, finish = 'stop') => ok({ choices: [{ message: { content }, finish_reason: finish }] })
const sentBody = (i = 0) => JSON.parse(fetchWithRetry.mock.calls[i][1].body)

const ENV = { ...process.env }
beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ENV }
  delete process.env.AI_PROVIDER
  delete process.env.AI_PROVIDER_VISION
  delete process.env.MISTRAL_VISION_MODEL
  delete process.env.MISTRAL_MODEL
  delete process.env.ANTHROPIC_MODEL
  process.env.ANTHROPIC_API_KEY = 'sk-ant'
  process.env.MISTRAL_API_KEY = 'sk-mis'
})
afterAll(() => { process.env = ENV })

const IMAGE_MSG = [{ role: 'user', content: [
  { type: 'image', mediaType: 'image/jpeg', base64: 'AAAA' },
  { type: 'text', text: 'Extrais le contact' },
] }]

describe('providerOrder', () => {
  it('Anthropic par défaut, Mistral en secours', () => {
    expect(providerOrder()).toEqual(['anthropic', 'mistral'])
  })
  it('AI_PROVIDER=mistral inverse l’ordre', () => {
    process.env.AI_PROVIDER = 'Mistral'
    expect(providerOrder()).toEqual(['mistral', 'anthropic'])
  })
  it('ignore un fournisseur sans clé', () => {
    process.env.AI_PROVIDER = 'mistral'
    delete process.env.MISTRAL_API_KEY
    expect(providerOrder()).toEqual(['anthropic'])
  })
})

describe('generate — fournisseur et modèle propres à une demande', () => {
  it('prefer=mistral + mistralModel, malgré AI_PROVIDER=anthropic ; Claude en secours', async () => {
    fetchWithRetry.mockResolvedValueOnce(err(503, 'overloaded')).mockResolvedValueOnce(anthropicReply('ok'))
    const r = await generate({ prefer: 'mistral', mistralModel: 'mistral-large-latest', messages: [{ role: 'user', content: 'x' }] })
    expect(sentBody(0).model).toBe('mistral-large-latest')
    expect(fetchWithRetry.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(r).toMatchObject({ ok: true, provider: 'anthropic', fallbackFrom: 'mistral' })
    expect(providerOrder({ prefer: 'mistral' })).toEqual(['mistral', 'anthropic'])
  })
})

describe('generate — Mistral', () => {
  beforeEach(() => { process.env.AI_PROVIDER = 'mistral'; process.env.AI_PROVIDER_VISION = 'mistral' })

  it('envoie image (data URL), consignes en message system et JSON libre', async () => {
    fetchWithRetry.mockResolvedValue(mistralReply('{"nom":"Dupont"}'))
    const r = await generate({ system: 'Tu extrais', messages: IMAGE_MSG, maxTokens: 500, json: true })
    expect(r).toEqual({ ok: true, text: '{"nom":"Dupont"}', stopReason: 'end', provider: 'mistral' })
    const [url, opts] = fetchWithRetry.mock.calls[0]
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions')
    expect(opts.headers.Authorization).toBe('Bearer sk-mis')
    expect(sentBody()).toEqual({
      model: 'mistral-small-latest',
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'Tu extrais' },
        { role: 'user', content: [
          { type: 'image_url', image_url: 'data:image/jpeg;base64,AAAA' },
          { type: 'text', text: 'Extrais le contact' },
        ] },
      ],
      response_format: { type: 'json_object' },
    })
  })

  it('schéma JSON → response_format json_schema strict ; MISTRAL_MODEL respecté', async () => {
    process.env.MISTRAL_MODEL = 'mistral-medium-latest'
    fetchWithRetry.mockResolvedValue(mistralReply([{ type: 'text', text: '{"a":1}' }]))
    const schema = { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false }
    const r = await generate({ messages: [{ role: 'user', content: 'x' }], json: schema })
    expect(r.text).toBe('{"a":1}')
    expect(sentBody().model).toBe('mistral-medium-latest')
    expect(sentBody().response_format).toEqual({ type: 'json_schema', json_schema: { name: 'reponse', schema, strict: true } })
    expect(sentBody().messages).toEqual([{ role: 'user', content: 'x' }])
  })

  it('finish_reason length → réponse tronquée', async () => {
    fetchWithRetry.mockResolvedValue(mistralReply('{"a":', 'length'))
    expect((await generate({ messages: [{ role: 'user', content: 'x' }] })).stopReason).toBe('max_tokens')
  })
})

describe('generate — images (AI_PROVIDER_VISION)', () => {
  it('AI_PROVIDER=mistral : le texte part chez Mistral, les images restent chez Claude par défaut', async () => {
    process.env.AI_PROVIDER = 'mistral'
    fetchWithRetry.mockResolvedValue(anthropicReply('{"nom":"Dupont"}'))
    const img = await generate({ messages: IMAGE_MSG, json: true })
    expect(img.provider).toBe('anthropic')
    expect(fetchWithRetry.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')

    fetchWithRetry.mockResolvedValue(mistralReply('Bonjour'))
    const txt = await generate({ messages: [{ role: 'user', content: 'Salut' }] })
    expect(txt.provider).toBe('mistral')
  })

  it('AI_PROVIDER_VISION=mistral + MISTRAL_VISION_MODEL : modèle dédié aux images', async () => {
    process.env.AI_PROVIDER_VISION = 'mistral'
    process.env.MISTRAL_VISION_MODEL = 'mistral-medium-latest'
    fetchWithRetry.mockResolvedValue(mistralReply('{}'))
    await generate({ messages: IMAGE_MSG, json: true })
    expect(sentBody().model).toBe('mistral-medium-latest')
  })

  it('images sans clé Anthropic : Mistral quand même', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(providerOrder({ vision: true })).toEqual(['mistral'])
  })
})

describe('generate — secours entre fournisseurs', () => {
  it('crédit Anthropic épuisé → la demande part chez Mistral', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(err(400, JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } })))
      .mockResolvedValueOnce(mistralReply('{"ok":true}'))
    const log = { error: jest.fn(), warn: jest.fn() }
    const r = await generate({ messages: IMAGE_MSG, json: true, log })
    expect(r).toMatchObject({ ok: true, provider: 'mistral', text: '{"ok":true}' })
    expect(r.fallbackFrom).toBe('anthropic')
    expect(r.fallbackReason).toMatch(/Crédit/)
    expect(fetchWithRetry.mock.calls.map(c => c[0])).toEqual([
      'https://api.anthropic.com/v1/messages', 'https://api.mistral.ai/v1/chat/completions',
    ])
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/secours IA/))
  })

  it('Mistral en panne (délai dépassé) → Claude prend le relais', async () => {
    process.env.AI_PROVIDER = 'mistral'
    fetchWithRetry
      .mockRejectedValueOnce(new Error('The operation was aborted'))
      .mockResolvedValueOnce(anthropicReply('Bonjour'))
    const r = await generate({ messages: [{ role: 'user', content: 'Salut' }] })
    expect(r).toMatchObject({ ok: true, provider: 'anthropic', text: 'Bonjour' })
    // Côté Anthropic, l'image et le texte gardent leur format natif
    expect(sentBody(1).messages).toEqual([{ role: 'user', content: 'Salut' }])
  })

  it('image refusée : pas de bascule, message clair', async () => {
    fetchWithRetry.mockResolvedValueOnce(err(400, JSON.stringify({
      type: 'error', error: { type: 'invalid_request_error', message: 'image dimensions exceed max allowed size' },
    })))
    const r = await generate({ messages: IMAGE_MSG })
    expect(r).toMatchObject({ ok: false, status: 422, provider: 'anthropic' })
    expect(r.message).toMatch(/Image refusée/)
    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
  })

  it('les deux indisponibles : dernier message renvoyé', async () => {
    fetchWithRetry
      .mockResolvedValueOnce(err(529, 'overloaded'))
      .mockResolvedValueOnce(err(401, 'Unauthorized'))
    const r = await generate({ messages: [{ role: 'user', content: 'x' }] })
    expect(r).toMatchObject({ ok: false, provider: 'mistral', status: 502 })
    expect(r.message).toMatch(/Clé API Mistral/)
  })

  it('aucune clé : erreur de configuration sans appel réseau', async () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.MISTRAL_API_KEY
    const r = await generate({ messages: [{ role: 'user', content: 'x' }] })
    expect(r).toMatchObject({ ok: false, status: 500 })
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  it('describeMistralError', () => {
    expect(describeMistralError(429, '').status).toBe(429)
    expect(describeMistralError(402, '').message).toMatch(/Crédit ou quota/)
    expect(describeMistralError(503, '').status).toBe(503)
    expect(describeMistralError(400, 'invalid image').status).toBe(422)
  })
  it('stripJsonFence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(stripJsonFence(' {"a":1} ')).toBe('{"a":1}')
  })
})

describe('documents PDF', () => {
  const PDF_MSG = [{ role: 'user', content: [
    { type: 'document', mediaType: 'application/pdf', base64: 'JVBERi0x' },
    { type: 'text', text: 'Lis ce document' },
  ] }]

  it('envoyés à Claude en bloc « document »', async () => {
    fetchWithRetry.mockResolvedValueOnce(anthropicReply('{}'))
    const r = await generate({ messages: PDF_MSG })
    expect(r).toMatchObject({ ok: true, provider: 'anthropic' })
    expect(sentBody().messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } })
  })

  it('jamais envoyés à Mistral : pas de secours, même si Mistral est choisi pour les images', async () => {
    process.env.AI_PROVIDER_VISION = 'mistral'
    fetchWithRetry.mockResolvedValueOnce(err(529, 'overloaded'))
    const r = await generate({ messages: PDF_MSG })
    expect(r.ok).toBe(false)
    expect(fetchWithRetry).toHaveBeenCalledTimes(1)
    expect(fetchWithRetry.mock.calls[0][0]).toMatch(/anthropic/)
  })

  it('sans clé Anthropic : message clair', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await generate({ messages: PDF_MSG })
    expect(r).toMatchObject({ ok: false, status: 503 })
    expect(r.message).toMatch(/ANTHROPIC_API_KEY/)
    expect(fetchWithRetry).not.toHaveBeenCalled()
  })
})
