'use client'
import { useState, useCallback, useEffect } from 'react'
import { supabaseService } from '../services/supabaseService'

/**
 * Hook pour gérer le chargement et rechargement des données du dashboard
 * Centralise la logique de chargement globale
 */
export function useDashboardData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await supabaseService.loadAll()
      setData(result)
    } catch (err) {
      console.error('Erreur chargement données:', err)
      setError(err.message || 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }, [])

  const reload = useCallback(async () => {
    try {
      const result = await supabaseService.loadAll()
      setData(result)
    } catch (err) {
      console.error('Erreur rechargement données:', err)
      setError(err.message || 'Erreur lors du rechargement')
    }
  }, [])

  return { data, loading, error, loadData, reload }
}
