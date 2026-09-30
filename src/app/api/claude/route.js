// Route /api/claude — proxy Anthropic avec auth JWT + rate limit
//
// Sécurité :
// - Vérifie que l'appel vient d'un utilisateur Supabase authentifié
//   (Bearer token dans le header Authorization) avant de relayer à Anthropic.
//   Sinon, n'importe qui connaissant l'URL pourrait drainer le quota
//   Anthropic (= coût direct sur la carte bancaire).
// - Rate limit en mémoire par IP en plus : 20 req/min, même pattern que
//   /api/extract-*. Double filet de sécurité.
// - Modèle imposé côté serveur (lib/ai.js : Claude Haiku 4.5 ou Mistral selon
//   AI_PROVIDER) et max_tokens plafonné : le client ne peut ni choisir un
//   modèle plus cher ni demander une sortie illimitée.

import { verifyAuth } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { generate } from '@/app/lib/ai'

const log = createLogger('claude')

const DEFAULT_MAX_TOKENS = 1000
const MAX_TOKENS_CAP = 4000

function clampMaxTokens(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_TOKENS
  return Math.min(n, MAX_TOKENS_CAP)
}

// Rate limiting simple en mémoire (par IP)
const rateLimit = new Map(); // ip → { count, resetAt }
const LIMIT = 20;
const WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

// Nettoyage périodique pour éviter une fuite mémoire (entrées expirées)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit.entries()) {
    if (now > entry.resetAt) rateLimit.delete(ip);
  }
}, WINDOW_MS * 5);

// Bloc Anthropic ({ type: 'text' } / { type: 'image', source: base64 }) →
// partie du format commun de lib/ai.js
function toCommonPart(block) {
  if (block?.type === 'image' && block.source?.type === 'base64') {
    return { type: 'image', mediaType: block.source.media_type, base64: block.source.data }
  }
  return { type: 'text', text: String(block?.text ?? '') }
}
function toCommonMessage(m) {
  const role = m?.role === 'assistant' ? 'assistant' : 'user'
  if (Array.isArray(m?.content)) return { role, content: m.content.map(toCommonPart) }
  return { role, content: String(m?.content ?? '') }
}

export async function POST(request) {
  try {
    // 1. Vérification rate limit par IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return Response.json(
        { error: "Trop de requêtes — attendez 1 minute avant de réessayer." },
        { status: 429 }
      );
    }

    // 2. Vérification JWT Supabase — bloque les appels anonymes
    const user = await verifyAuth(request);
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    // Messages au format Anthropic (texte ou blocs) → format commun lib/ai.js
    const messages = (Array.isArray(body.messages) ? body.messages : []).map(toCommonMessage);

    // Claude ou Mistral selon AI_PROVIDER (secours automatique sur l'autre)
    const ai = await generate({
      system: typeof body.system === 'string' ? body.system : '',
      messages,
      maxTokens: clampMaxTokens(body.max_tokens),
      // Claude peut prendre ~20s sur une vision ou un long prompt ; on laisse 30s
      timeoutMs: 30000,
      log,
    });
    if (!ai.ok) {
      return Response.json({ error: ai.message }, { status: ai.status });
    }

    // Réponse au format Anthropic (le navigateur lit content[].text)
    return Response.json({
      content: [{ type: 'text', text: ai.text }],
      stop_reason: ai.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn',
      provider: ai.provider,
      // Secours utilisé : le fournisseur choisi (AI_PROVIDER) a échoué
      ...(ai.fallbackFrom ? { fallback_from: ai.fallbackFrom, fallback_reason: ai.fallbackReason } : {}),
    });

  } catch (error) {
    log.error('exception', error?.message || error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
