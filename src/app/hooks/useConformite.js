'use client'
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { apiPost } from '../lib/crmApi'
import { complianceByContact, PAUSE_KEY } from '../lib/conformite'
import { localISO } from '../lib/today'

export const CONFORMITE_KEY = ['conformite', 'all']

const missing = (err) => err && (err.code === '42P01' || /does not exist|schema cache/i.test(err.message || ''))

async function loadConformite() {
  const [docs, reqs, pause, legal] = await Promise.all([
    supabase.from('contact_documents').select('*').order('created_at', { ascending: false }),
    supabase.from('contact_doc_requests')
      .select('id, contact_id, email, auto, envois, dernier_envoi, expire_le, derniere_visite, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('settings').select('value').eq('key', PAUSE_KEY).maybeSingle(),
    // Contrôle légal (migration 039) : absent → liste vide
    supabase.from('contact_legal_checks').select('*'),
  ])
  if (missing(docs.error) || missing(reqs.error)) return { docs: [], requests: [], missingMigration: true, globalPause: false }
  if (docs.error) throw docs.error
  if (reqs.error) throw reqs.error
  return {
    docs: docs.data || [], requests: reqs.data || [], missingMigration: false, globalPause: pause?.data?.value === 'on',
    legal: legal?.error ? [] : (legal?.data || []),
  }
}

/** Appel de /api/conformite (équipe) : renvoie `data`. */
export const conformitePost = async (body) => (await apiPost('/api/conformite', body)).data

/**
 * Documents administratifs des entreprises (Kbis, décennale, fiscale,
 * URSSAF) : documents + demandes envoyées, situation par contact.
 * Réservé à l'équipe (RLS) : à désactiver côté maître d'ouvrage.
 */
export function useConformite({ enabled = true } = {}) {
  const queryClient = useQueryClient()
  const q = useQuery({ queryKey: CONFORMITE_KEY, queryFn: loadConformite, enabled, staleTime: 5 * 60 * 1000 })
  const reload = useCallback(() => queryClient.invalidateQueries({ queryKey: CONFORMITE_KEY }), [queryClient])
  const today = localISO()
  const data = q.data
  const byContact = useMemo(() => complianceByContact(data?.docs || [], today), [data, today])
  const legalByContact = useMemo(() => new Map((data?.legal || []).map(l => [l.contact_id, l])), [data])
  const lastRequest = useMemo(() => {
    const m = new Map()
    for (const r of data?.requests || []) if (!m.has(r.contact_id)) m.set(r.contact_id, r)
    return m
  }, [data])
  return {
    docs: data?.docs || [],
    byContact,
    lastRequest,
    today,
    missingMigration: !!data?.missingMigration,
    // Toutes les relances automatiques suspendues (settings)
    globalPause: !!data?.globalPause,
    // Dernier contrôle légal (annuaire + BODACC) par contact
    legal: data?.legal || [],
    legalByContact,
    ready: q.status !== 'pending',
    reload,
  }
}
