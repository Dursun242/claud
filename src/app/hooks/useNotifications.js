'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

/**
 * useNotifications(userEmail)
 * Charge les 10 dernières notifs de l'utilisateur + s'abonne en temps réel.
 *
 * Retourne :
 *  - items          : array<notification>, plus récente d'abord (max 10)
 *  - unreadCount    : nombre total de non-lues (limité à 99+ dans l'UI)
 *  - loading        : boolean
 *  - markAsRead(id) : marque une notif comme lue
 *  - markAllRead()  : marque toutes les non-lues comme lues
 *  - reload()       : force un rechargement
 */
export function useNotifications(userEmail) {
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const channelRef = useRef(null)

  const email = (userEmail || '').toLowerCase().trim()

  const load = useCallback(async () => {
    if (!email) return
    setLoading(true)
    try {
      const [{ data: recent }, { count }] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, kind, entity_type, entity_id, chantier_id, title, body, target_tab, read_at, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null),
      ])
      setItems(recent || [])
      setUnreadCount(count || 0)
    } catch (err) {
      console.warn('[useNotifications] load:', err?.message || err)
    } finally {
      setLoading(false)
    }
  }, [email])

  // Chargement initial
  useEffect(() => { load() }, [load])

  // Realtime : écoute les INSERT + UPDATE sur MES notifications
  useEffect(() => {
    if (!email) return
    const channel = supabase
      .channel(`notifications:${email}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_email=eq.${email}`,
      }, () => { load() })
      .subscribe()
    channelRef.current = channel
    return () => {
      try { supabase.removeChannel(channel) } catch (_) {}
      channelRef.current = null
    }
  }, [email, load])

  const markAsRead = useCallback(async (id) => {
    try {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch (err) {
      console.warn('[useNotifications] markAsRead:', err?.message || err)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    if (!email) return
    try {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_email', email).is('read_at', null)
      await load()
    } catch (err) {
      console.warn('[useNotifications] markAllRead:', err?.message || err)
    }
  }, [email, load])

  return { items, unreadCount, loading, markAsRead, markAllRead, reload: load }
}
