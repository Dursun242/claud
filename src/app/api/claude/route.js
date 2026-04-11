// Route /api/claude — proxy Anthropic avec auth JWT + rate limit
//
// Sécurité :
// - Vérifie que l'appel vient d'un utilisateur Supabase authentifié
//   (Bearer token dans le header Authorization) avant de relayer à Anthropic.
//   Sinon, n'importe qui connaissant l'URL pourrait drainer le quota
//   Anthropic (= coût direct sur la carte bancaire).
// - Rate limit en mémoire par IP en plus : 20 req/min, même pattern que
//   /api/extract-*. Double filet de sécurité.

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

// Vérification auth : Bearer token Supabase valide
// Utilise le Anon key côté serveur juste pour décoder le JWT — pas besoin du service role.
async function verifyAuth(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    const { data: { user } } = await client.auth.getUser(token);
    return user || null;
  } catch {
    return null;
  }
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
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[claude] Anthropic ${response.status} ${errorText}`);
      return Response.json(
        { error: 'Erreur du service IA' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    console.error('[claude] exception:', error);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
