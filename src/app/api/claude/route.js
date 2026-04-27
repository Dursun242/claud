// Route /api/claude — proxy Anthropic avec auth JWT + rate limit
//
// Sécurité :
// - Vérifie que l'appel vient d'un utilisateur Supabase authentifié
//   (Bearer token dans le header Authorization) avant de relayer à Anthropic.
//   Sinon, n'importe qui connaissant l'URL pourrait drainer le quota
//   Anthropic (= coût direct sur la carte bancaire).
// - Rate limit en mémoire par IP en plus : 20 req/min, même pattern que
//   /api/extract-*. Double filet de sécurité.

import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('claude')

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
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-haiku-4-5-20251001",
        max_tokens: body.max_tokens || 1000,
        system: body.system || "",
        messages: body.messages || [],
      }),
      // Claude peut prendre ~20s sur une vision ou un long prompt ; on laisse 30s
      timeoutMs: 30000,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      log.error(`Anthropic ${response.status}`, errorText);

      if (response.status === 429) {
        return Response.json(
          { error: 'Service IA surchargé — réessayez dans quelques instants.' },
          { status: 429 }
        );
      }
      // 4xx hors 429 = problème de configuration serveur (clé API invalide,
      // modèle non accessible, etc.). On retourne 502 pour ne pas confondre
      // l'appelant avec un 403/401 de notre propre couche d'authentification.
      if (response.status >= 400 && response.status < 500) {
        return Response.json(
          { error: 'Configuration du service IA invalide — contactez l\'administrateur.' },
          { status: 502 }
        );
      }
      return Response.json(
        { error: 'Service IA temporairement indisponible.' },
        { status: 503 }
      );
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    log.error('exception', error?.message || error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
