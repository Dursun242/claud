import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook pour gérer les appels API avec gestion d'état complète
 * Évite les memory leaks et gère les annulations
 */
export function useAsync(asyncFunction, immediate = true, deps = []) {
  const [status, setStatus] = useState('idle') // idle | pending | success | error
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const isMounted = useRef(true)

  const execute = useCallback(async () => {
    setStatus('pending')
    setData(null)
    setError(null)

    try {
      const response = await asyncFunction()
      if (isMounted.current) {
        setData(response)
        setStatus('success')
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err)
        setStatus('error')
      }
    }
  }, [asyncFunction])

  useEffect(() => {
    if (immediate) {
      execute()
    }

    return () => {
      isMounted.current = false
    }
  }, [execute, immediate, ...deps])

  return { execute, status, data, error, isLoading: status === 'pending' }
}
