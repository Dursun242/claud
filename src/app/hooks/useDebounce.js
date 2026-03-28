import { useState, useEffect } from 'react'

/**
 * Hook pour debounce une valeur
 * Utile pour les recherches, filtres, etc.
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook pour throttle un callback
 * Utile pour les événements fréquents (scroll, resize, etc.)
 */
export function useThrottle(callback, delay = 300) {
  const [throttledCallback, setThrottledCallback] = useState(callback)

  useEffect(() => {
    let lastCall = 0

    const throttled = (...args) => {
      const now = Date.now()
      if (now - lastCall >= delay) {
        lastCall = now
        callback(...args)
      }
    }

    setThrottledCallback(() => throttled)
  }, [callback, delay])

  return throttledCallback
}
