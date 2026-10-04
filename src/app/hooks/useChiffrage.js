'use client'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { normalizeLots } from '../lib/chiffrage'

const missing = (err) => err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message || ''))
export const chiffrageKey = (id) => ['chiffrage', id]

async function loadChiffrage(chantierId) {
  const { data, error } = await supabase.from('chantier_chiffrages').select('*').eq('chantier_id', chantierId).maybeSingle()
  if (missing(error)) return { missingMigration: true, chiffrage: null }
  if (error) throw error
  return { missingMigration: false, chiffrage: data ? { ...data, lots: normalizeLots(data.lots) } : null }
}

/**
 * Chiffrage estimatif (DPGF) d'un chantier — table chantier_chiffrages
 * (migration 040), réservée à l'équipe par RLS.
 */
export function useChiffrage(chantierId, { enabled = true } = {}) {
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: chiffrageKey(chantierId),
    queryFn: () => loadChiffrage(chantierId),
    enabled: enabled && !!chantierId,
    staleTime: 5 * 60 * 1000,
  })

  const save = useCallback(async (c, userEmail) => {
    const row = {
      chantier_id: chantierId,
      description: c.description || '',
      surface_m2: Number(c.surface_m2) > 0 ? Number(c.surface_m2) : null,
      surface_annexes: Number(c.surface_annexes) > 0 ? Number(c.surface_annexes) : null,
      reference: String(c.reference || '').trim().slice(0, 80) || null,
      indice: String(c.indice || '').trim().slice(0, 10) || null,
      observations: String(c.observations || '').trim().slice(0, 4000) || null,
      lots: normalizeLots(c.lots),
      aleas_pct: Number(c.aleas_pct) || 0,
      tva_pct: Number.isFinite(Number(c.tva_pct)) && c.tva_pct !== '' ? Number(c.tva_pct) : 20,
      source: c.source || 'manuel',
      updated_at: new Date().toISOString(),
      updated_by: userEmail || null,
    }
    const { data, error } = await supabase.from('chantier_chiffrages').upsert(row, { onConflict: 'chantier_id' }).select().single()
    if (missing(error)) throw new Error('Chiffrage indisponible : appliquer la migration 040 dans Supabase.')
    if (error) throw new Error('Enregistrement du chiffrage : ' + error.message)
    queryClient.setQueryData(chiffrageKey(chantierId), { missingMigration: false, chiffrage: { ...data, lots: normalizeLots(data.lots) } })
    return data
  }, [chantierId, queryClient])

  const remove = useCallback(async () => {
    const { error } = await supabase.from('chantier_chiffrages').delete().eq('chantier_id', chantierId)
    if (error) throw new Error('Suppression du chiffrage : ' + error.message)
    queryClient.setQueryData(chiffrageKey(chantierId), { missingMigration: false, chiffrage: null })
  }, [chantierId, queryClient])

  return {
    chiffrage: q.data?.chiffrage || null,
    missingMigration: !!q.data?.missingMigration,
    ready: q.status !== 'pending' || !chantierId,
    error: q.error,
    save,
    remove,
  }
}
