// rateLimit.js — rate limiter en mémoire par clé (typiquement l'IP).
//
// Remplace le pattern Map + setInterval dupliqué dans /api/claude et
// /api/extract-* : pas de timer module-level (le nettoyage se fait à la
// volée), et taille bornée pour ne pas croître indéfiniment face à un
// grand nombre d'IPs uniques.
//
// Limite connue (assumée) : en serverless multi-instance, chaque instance
// a son propre compteur. C'est un filet de sécurité contre l'abus simple,
// pas un quota strict global.

/**
 * Crée un limiteur indépendant. À instancier au niveau module d'une route.
 * @returns {(key: string) => boolean} true si la requête est autorisée
 */
export function createRateLimiter({ limit = 10, windowMs = 60_000, maxEntries = 10_000 } = {}) {
  const entries = new Map() // clé → { count, resetAt }

  return function check(key) {
    const now = Date.now()
    const entry = entries.get(key)

    if (entry && now <= entry.resetAt) {
      if (entry.count >= limit) return false
      entry.count++
      return true
    }

    if (entries.size >= maxEntries) {
      for (const [k, e] of entries.entries()) {
        if (now > e.resetAt) entries.delete(k)
      }
      // Toujours saturé après purge : on refuse plutôt que de croître
      if (entries.size >= maxEntries) return false
    }

    entries.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
}

/** Extrait l'IP cliente d'une Request Next.js (derrière proxy Vercel). */
export function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
