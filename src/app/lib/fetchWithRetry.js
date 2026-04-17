// ═══════════════════════════════════════════════════════════════
// fetchWithRetry — wrapper autour de fetch() avec timeout + retry
// ═══════════════════════════════════════════════════════════════
//
// Pourquoi : les routes /api/* côté serveur appellent des APIs tierces
// (Pappers, Qonto, Odoo, Anthropic) qui peuvent :
//   - mettre plusieurs minutes à répondre (hang du client côté mobile)
//   - renvoyer des 5xx transitoires (cluster qui redémarre, timeout interne)
//   - être momentanément injoignables (DNS, TLS handshake raté)
//
// Ce helper :
//   - coupe après `timeoutMs` (par défaut 15s) via AbortController
//   - retry 2 fois max, UNIQUEMENT sur 5xx ou erreur réseau (jamais sur 4xx)
//   - backoff exponentiel avec jitter (300ms → 900ms → 2.7s)
//
// À utiliser pour TOUT appel sortant vers une API tierce. À NE PAS utiliser
// pour les appels internes à Supabase (qui ont leur propre client).

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt) {
  // Exponentiel 3^attempt * base, + jitter ±30% pour éviter le thundering herd
  const exp = BASE_DELAY_MS * Math.pow(3, attempt);
  const jitter = exp * (0.7 + Math.random() * 0.6);
  return Math.round(jitter);
}

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number, maxRetries?: number, retryOn5xx?: boolean }} options
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryOn5xx = true,
    ...fetchOptions
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Succès ou erreur client (4xx) → on retourne tel quel, pas de retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // 5xx → retry si on a encore du budget
      if (retryOn5xx && attempt < maxRetries) {
        await sleep(computeBackoff(attempt));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      // AbortError (timeout) ou erreur réseau → retry
      if (attempt < maxRetries) {
        await sleep(computeBackoff(attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('fetchWithRetry: unexpected loop exit');
}

/**
 * Variante qui lève directement si la réponse n'est pas OK.
 * Pratique quand on veut juste le JSON et propager l'erreur.
 */
export async function fetchJsonWithRetry(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    err.status = response.status;
    err.body = text;
    throw err;
  }
  return response.json();
}
