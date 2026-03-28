/**
 * Cache système pour optimiser les requêtes API
 * Évite les appels dupliqués et réduit la charge serveur
 */

const cache = new Map()
const timers = new Map()

export const apiCache = {
  /**
   * Récupère les données du cache ou appelle la fonction
   */
  async get(key, fetcher, ttl = 5 * 60 * 1000) {
    // Si en cache et pas expiré, retourner
    if (cache.has(key)) {
      return cache.get(key)
    }

    // Sinon, appeler fetcher
    try {
      const data = await fetcher()
      this.set(key, data, ttl)
      return data
    } catch (error) {
      console.error(`[API Cache] Erreur pour ${key}:`, error)
      throw error
    }
  },

  /**
   * Sauvegarde dans le cache avec TTL
   */
  set(key, data, ttl = 5 * 60 * 1000) {
    // Nettoyer le timer précédent
    if (timers.has(key)) {
      clearTimeout(timers.get(key))
    }

    // Sauvegarder
    cache.set(key, data)

    // Configurer expiration
    const timer = setTimeout(() => {
      cache.delete(key)
      timers.delete(key)
    }, ttl)

    timers.set(key, timer)
  },

  /**
   * Nettoie le cache entièrement
   */
  clear() {
    cache.clear()
    timers.forEach(timer => clearTimeout(timer))
    timers.clear()
  },

  /**
   * Supprime une clé spécifique
   */
  delete(key) {
    cache.delete(key)
    if (timers.has(key)) {
      clearTimeout(timers.get(key))
      timers.delete(key)
    }
  },

  /**
   * Invalide les clés qui correspondent un pattern
   */
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern)
    const keysToDelete = Array.from(cache.keys()).filter(key => regex.test(key))
    keysToDelete.forEach(key => this.delete(key))
  },

  /**
   * Obtient les stats du cache
   */
  getStats() {
    return {
      size: cache.size,
      keys: Array.from(cache.keys()),
    }
  },
}
