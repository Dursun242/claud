'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

// Le badge ne compte que l'activité récente : au-delà, une notification non
// lue n'est plus une urgence (elle reste visible et marquable dans la liste).
export const BADGE_WINDOW_DAYS = 7
// Notifications brutes chargées pour la liste (avant regroupement)
const FETCH_LIMIT = 40
// Lignes affichées après regroupement
export const MAX_GROUPS = 10

const windowStart = (now = Date.now()) => now - BADGE_WINDOW_DAYS * 24 * 3600 * 1000
const sinceIso = () => new Date(windowStart()).toISOString()

// Filtre PostgREST « auteur ≠ moi » : actor_email est enregistré en minuscules
// (auth_email() côté triggers, norm() côté serveur) ; NULL = action système
// (synchro Odoo, Qonto…), à garder.
const notMineFilter = (email) => `actor_email.is.null,actor_email.neq."${email}"`

/** Libellé du badge : « 9+ » au-delà de 9 (un « 99+ » permanent n'est plus lu). */
export function badgeLabel(count) {
  return count > 9 ? '9+' : String(count)
}

/**
 * Regroupe les notifications d'un même élément (entity_type + entity_id) en
 * une seule ligne, placée à la position de la plus récente.
 * Entrée triée du plus récent au plus ancien ; sortie dans le même ordre :
 *   { key, latest, items, ids, count, unreadIds }
 * Sans entity_id (rare), chaque notification reste seule.
 */
export function groupNotifications(list, max = MAX_GROUPS) {
  const groups = []
  const byKey = new Map()
  for (const n of list || []) {
    const key = n.entity_id ? `${n.entity_type}:${n.entity_id}` : `id:${n.id}`
    let g = byKey.get(key)
    if (!g) {
      g = { key, latest: n, items: [], ids: [], count: 0, unreadIds: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.items.push(n)
    g.ids.push(n.id)
    g.count += 1
    if (!n.read_at) g.unreadIds.push(n.id)
  }
  return groups.slice(0, max)
}

/**
 * useNotifications(userEmail)
 * Charge les dernières notifs de l'utilisateur + s'abonne en temps réel.
 * Les actions de l'utilisateur lui-même (actor_email = son email) sont
 * ignorées : les triggers SQL notifient toute l'équipe, auteur compris.
 *
 * Retourne :
 *  - items          : array<notification>, plus récente d'abord
 *  - unreadCount    : non-lues des 7 derniers jours (affiché « 9+ » au-delà de 9)
 *  - loading        : boolean
 *  - markAsRead(id | ids[]) : marque une notif (ou un groupe) comme lue
 *  - markAllRead()  : marque toutes les non-lues comme lues
 *  - reload()       : force un rechargement
 */
export function useNotifications(userEmail) {
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  // incrémenté à chaque INSERT realtime (d'un autre utilisateur), une fois la
  // liste rechargée → items[0] est alors bien la nouvelle notification
  const [newItemSignal, setNewItemSignal] = useState(0)
  const channelRef = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const email = (userEmail || '').toLowerCase().trim()

  const load = useCallback(async () => {
    if (!email) return
    setLoading(true)
    try {
      const [{ data: recent }, { count }] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab, read_at, created_at')
          .or(notMineFilter(email))
          .order('created_at', { ascending: false })
          .limit(FETCH_LIMIT),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null)
          .gte('created_at', sinceIso())
          .or(notMineFilter(email)),
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
      }, (payload) => {
        // Seuls les INSERT d'un autre auteur déclenchent le signal "nouvelle activité"
        const actor = (payload?.new?.actor_email || '').toLowerCase().trim()
        const isNew = payload?.eventType === 'INSERT' && actor !== email
        Promise.resolve(load()).then(() => {
          if (isNew) setNewItemSignal((n) => n + 1)
        })
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      try { supabase.removeChannel(channel) } catch (_) {}
      channelRef.current = null
    }
  }, [email, load])

  const markAsRead = useCallback(async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean)
    if (!ids.length) return
    try {
      const now = new Date().toISOString()
      await supabase.from('notifications').update({ read_at: now }).in('id', ids)
      // Décompte : seules les non-lues comptées par le badge (7 derniers jours)
      const since = windowStart()
      const idSet = new Set(ids)
      const counted = itemsRef.current.filter(n =>
        idSet.has(n.id) && !n.read_at && new Date(n.created_at).getTime() >= since).length
      setItems(prev => prev.map(n => idSet.has(n.id) && !n.read_at ? { ...n, read_at: now } : n))
      setUnreadCount(c => Math.max(0, c - counted))
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

  return { items, unreadCount, loading, newItemSignal, markAsRead, markAllRead, reload: load }
}
