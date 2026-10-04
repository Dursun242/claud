// ═══════════════════════════════════════════════════════════════
// ai.js — appel IA commun (serveur) : Anthropic (Claude) ou Mistral
// ═══════════════════════════════════════════════════════════════
//
// Choix du fournisseur (variables d'environnement Vercel) :
//   AI_PROVIDER=anthropic (défaut) | mistral          → demandes texte
//   AI_PROVIDER_VISION=anthropic (défaut) | mistral   → demandes avec image
//     (import de contact / devis par photo : Claude lit mieux les petites
//     écritures ; indépendant de AI_PROVIDER)
//   ANTHROPIC_API_KEY, MISTRAL_API_KEY
//   ANTHROPIC_MODEL (défaut claude-haiku-4-5-20251001)
//   MISTRAL_MODEL   (défaut mistral-small-latest)
//   MISTRAL_VISION_MODEL (facultatif, pour les images ; défaut MISTRAL_MODEL)
//
// Une demande peut choisir son fournisseur (`prefer`) et ses modèles
// (`anthropicModel`, `mistralModel`) : ex. le chiffrage estimatif utilise un
// modèle Mistral puissant, le reste de l'application le modèle par défaut.
//
// Secours automatique : si le fournisseur principal est indisponible
// (crédit épuisé, clé refusée, trop de demandes, panne, délai dépassé) et
// que la clé de l'autre est configurée, la demande part chez l'autre.
// Une erreur liée à la demande elle-même (image refusée…) ne bascule pas.
//
// Format commun :
//   messages : [{ role: 'user'|'assistant', content: string | Part[] }]
//   Part     : { type: 'text', text } | { type: 'image', mediaType, base64 }
//            | { type: 'document', mediaType: 'application/pdf', base64 }
//              (PDF : Claude uniquement — sans clé Anthropic, la demande échoue)
//   json     : schéma JSON (sortie structurée) | true (JSON libre) | false

import { fetchWithRetry } from './fetchWithRetry'
import { describeAnthropicError } from './anthropicError'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MISTRAL_MODEL = 'mistral-small-latest'

const keyOf = (p) => (p === 'mistral' ? process.env.MISTRAL_API_KEY : process.env.ANTHROPIC_API_KEY)

const hasPart = (messages, type) => (messages || []).some(m => Array.isArray(m?.content) && m.content.some(p => p?.type === type))
const hasImage = (messages) => hasPart(messages, 'image') || hasPart(messages, 'document')

/**
 * Ordre d'essai : fournisseur choisi puis l'autre, parmi ceux qui ont une clé.
 * `vision` : la demande contient une image (AI_PROVIDER_VISION, Claude par défaut).
 * `prefer` : fournisseur choisi pour cette demande (sinon les réglages ci-dessus).
 */
export function providerOrder({ vision = false, prefer } = {}) {
  const setting = prefer || (vision ? (process.env.AI_PROVIDER_VISION || 'anthropic') : (process.env.AI_PROVIDER || 'anthropic'))
  const wanted = String(setting).toLowerCase().trim() === 'mistral' ? 'mistral' : 'anthropic'
  const other = wanted === 'mistral' ? 'anthropic' : 'mistral'
  return [wanted, other].filter(p => !!keyOf(p))
}

// ─── Anthropic ───
function toAnthropicContent(content) {
  if (typeof content === 'string') return content
  return content.map(p => (p.type === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
    : p.type === 'document'
      ? { type: 'document', source: { type: 'base64', media_type: p.mediaType || 'application/pdf', data: p.base64 } }
      : { type: 'text', text: p.text }))
}

async function callAnthropic({ system, messages, maxTokens, json, timeoutMs, maxRetries, anthropicModel }) {
  const body = {
    model: anthropicModel || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) })),
  }
  if (json && typeof json === 'object') body.output_config = { format: { type: 'json_schema', schema: json } }
  const res = await fetchWithRetry(ANTHROPIC_URL, {
    method: 'POST',
    timeoutMs, maxRetries,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    const { message, status } = describeAnthropicError(res.status, txt)
    return { ok: false, status, message, raw: txt, retryable: isProviderSide(res.status, txt) }
  }
  const data = await res.json()
  const text = (data?.content || []).filter(b => typeof b?.text === 'string' && (!b.type || b.type === 'text')).map(b => b.text).join('')
  const stopReason = data?.stop_reason === 'max_tokens' ? 'max_tokens' : data?.stop_reason === 'refusal' ? 'refusal' : 'end'
  return { ok: true, text, stopReason }
}

// ─── Mistral ───
function toMistralContent(content) {
  if (typeof content === 'string') return content
  return content.map(p => (p.type === 'image'
    ? { type: 'image_url', image_url: `data:${p.mediaType};base64,${p.base64}` }
    : { type: 'text', text: p.text }))
}

export function describeMistralError(status, bodyText) {
  const msg = String(bodyText || '').toLowerCase()
  if (status === 401) return { status: 502, message: 'Clé API Mistral invalide ou révoquée (configuration serveur MISTRAL_API_KEY).' }
  if (status === 402 || /billing|payment|credit|quota exceeded|insufficient/.test(msg)) {
    return { status: 502, message: 'Crédit ou quota de l’API Mistral épuisé : vérifiez l’abonnement sur console.mistral.ai.' }
  }
  if (status === 403) return { status: 502, message: 'Accès refusé par l’API Mistral (clé sans droit sur ce modèle).' }
  if (status === 404) return { status: 502, message: 'Modèle Mistral introuvable (configuration serveur MISTRAL_MODEL).' }
  if (status === 429) return { status: 429, message: 'Trop de demandes à l’IA en ce moment : réessayez dans une minute.' }
  if (status >= 500) return { status: 503, message: 'Service IA momentanément surchargé : réessayez dans quelques instants.' }
  if (/image/.test(msg)) {
    return { status: 422, message: 'Image refusée par l’IA (trop grande, format ou contenu illisible). Essayez une photo recadrée ou une capture plus courte.' }
  }
  return { status: 502, message: `Erreur du service IA (code ${status}).` }
}

function mistralText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.filter(c => c?.type === 'text').map(c => c.text).join('')
  return ''
}

async function callMistral({ system, messages, maxTokens, json, timeoutMs, maxRetries, vision, mistralModel }) {
  const body = {
    model: mistralModel || (vision && process.env.MISTRAL_VISION_MODEL) || process.env.MISTRAL_MODEL || DEFAULT_MISTRAL_MODEL,
    max_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(m => ({ role: m.role, content: toMistralContent(m.content) })),
    ],
  }
  if (json && typeof json === 'object') {
    body.response_format = { type: 'json_schema', json_schema: { name: 'reponse', schema: json, strict: true } }
  } else if (json) {
    body.response_format = { type: 'json_object' }
  }
  const res = await fetchWithRetry(MISTRAL_URL, {
    method: 'POST',
    timeoutMs, maxRetries,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    const { message, status } = describeMistralError(res.status, txt)
    return { ok: false, status, message, raw: txt, retryable: isProviderSide(res.status, txt) }
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  const text = mistralText(choice?.message?.content)
  const stopReason = choice?.finish_reason === 'length' ? 'max_tokens' : 'end'
  return { ok: true, text, stopReason }
}

// Panne ou compte du fournisseur (et non erreur de la demande) → on peut
// essayer l'autre fournisseur.
function isProviderSide(status, bodyText) {
  if (status >= 500 || [401, 402, 403, 404, 429].includes(status)) return true
  return /credit balance|billing|purchase credits|quota/i.test(String(bodyText || ''))
}

/**
 * Appelle l'IA. Ne lève jamais.
 * @returns {Promise<{ ok: true, text: string, stopReason: 'end'|'max_tokens'|'refusal', provider: string, fallbackFrom?: string, fallbackReason?: string }
 *                  | { ok: false, status: number, message: string, provider?: string, raw?: string }>}
 */
// `prefer` : fournisseur de cette demande ('anthropic' | 'mistral', sinon les
// réglages AI_PROVIDER*) ; `anthropicModel` / `mistralModel` : modèle propre à
// cette demande (sinon ANTHROPIC_MODEL / MISTRAL_MODEL).
export async function generate({ system, messages, maxTokens = 1024, json = false, timeoutMs = 30_000, maxRetries = 1, log, prefer, anthropicModel, mistralModel } = {}) {
  const vision = hasImage(messages)
  // Les PDF ne sont lus que par Claude (pas d'envoi de PDF à Mistral)
  const order = providerOrder({ vision, prefer }).filter(p => !hasPart(messages, 'document') || p === 'anthropic')
  if (!order.length && hasPart(messages, 'document') && providerOrder({ vision, prefer }).length) {
    return { ok: false, status: 503, message: 'Lecture des PDF indisponible : elle nécessite la clé Anthropic (ANTHROPIC_API_KEY).' }
  }
  if (!order.length) {
    log?.error('aucune clé IA configurée (ANTHROPIC_API_KEY / MISTRAL_API_KEY)')
    return { ok: false, status: 500, message: 'Configuration serveur invalide (IA non configurée).' }
  }
  let last = null
  for (const provider of order) {
    let r
    try {
      r = await (provider === 'mistral' ? callMistral : callAnthropic)({ system, messages, maxTokens, json, timeoutMs, maxRetries, vision, anthropicModel, mistralModel })
    } catch (e) {
      r = { ok: false, status: 503, message: 'Service IA injoignable : réessayez dans quelques instants.', raw: e?.message, retryable: true }
    }
    if (r.ok) {
      if (last) {
        log?.warn(`secours IA : ${last.provider} indisponible, réponse par ${provider}`)
        // Indique au navigateur que le fournisseur choisi a échoué, et pourquoi
        return { ...r, provider, fallbackFrom: last.provider, fallbackReason: last.message }
      }
      return { ...r, provider }
    }
    log?.error(`${provider} ${r.status}`, String(r.raw || '').slice(0, 500))
    last = { ...r, provider }
    if (!r.retryable) break
  }
  const { retryable: _r, ...rest } = last
  return rest
}

/** Retire un éventuel bloc ```json … ``` autour d'une réponse JSON. */
export function stripJsonFence(text) {
  const t = String(text || '').trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : t
}
