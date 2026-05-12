'use client'
import { useEffect, useState, useCallback, useRef } from 'react'

// Préfixe des clés localStorage : permet de purger sans toucher au reste.
const STORAGE_PREFIX = 'taskReminder:'
// Scan périodique (15 min) — utile si l'utilisateur laisse l'onglet ouvert
// pendant qu'une échéance passe à "aujourd'hui" ou "en retard".
const SCAN_INTERVAL_MS = 15 * 60 * 1000
// Au-delà de 2 jours, on purge les anciennes clés localStorage.
const KEY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Calcule les rappels à déclencher pour une liste de tâches.
 *
 * Fonction pure → testable sans mock DOM. La date du jour est injectable
 * pour rendre les tests indépendants du fuseau horaire de la machine.
 *
 * Règles :
 *   - tâche Terminée OU sans échéance → ignorée
 *   - échéance < aujourd'hui → 'overdue'
 *   - échéance = aujourd'hui → 'dueToday'
 *   - échéance = demain      → 'dueTomorrow'
 *   - sinon → ignorée
 *
 * @param {Array} tasks - { id, titre, echeance, statut, chantierId|chantier_id }
 * @param {Array} chantiers - { id, nom } pour enrichir le body
 * @param {string} today - YYYY-MM-DD (défaut : aujourd'hui)
 */
export function computeReminderTriggers(tasks = [], chantiers = [], today = todayISO()) {
  const tomorrow = addDaysISO(today, 1)
  const chById = new Map((chantiers || []).map(c => [c.id, c.nom]))
  const out = []

  for (const t of tasks || []) {
    if (!t?.echeance || t.statut === 'Terminé') continue
    let type = null
    if (t.echeance < today)        type = 'overdue'
    else if (t.echeance === today)    type = 'dueToday'
    else if (t.echeance === tomorrow) type = 'dueTomorrow'
    if (!type) continue

    const chantierName = chById.get(t.chantierId) || chById.get(t.chantier_id) || ''
    const titles = {
      overdue:     `⚠ En retard : ${t.titre}`,
      dueToday:    `Aujourd'hui : ${t.titre}`,
      dueTomorrow: `Demain : ${t.titre}`,
    }
    const suffixe = chantierName ? ` · ${chantierName}` : ''
    const bodies = {
      overdue:     `Échéance ${t.echeance}${suffixe}`,
      dueToday:    chantierName || `Échéance ${t.echeance}`,
      dueTomorrow: `Échéance ${t.echeance}${suffixe}`,
    }
    out.push({
      taskId: t.id,
      type,
      title: titles[type],
      body: bodies[type],
      // Clé de dédup : une notif max par (tâche × type × jour).
      dedupKey: `${STORAGE_PREFIX}${t.id}:${type}:${today}`,
    })
  }
  return out
}

function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Hook qui envoie des Notifications navigateur pour les tâches
 * en retard, dues aujourd'hui ou demain.
 *
 * Comportement :
 *   - Scan au mount, toutes les 15 min, et au retour de visibilité.
 *   - Dédup via localStorage : 1 notif max par (tâche × type × jour).
 *   - Au clic sur la notif → focus window + navigate vers l'onglet tâches.
 *   - Si la permission n'est pas accordée, rien n'est envoyé (mais on calcule
 *     quand même rien — pas d'effet de bord caché).
 *
 * @param {Array} tasks
 * @param {Array} chantiers
 * @param {Function} onNavigate - (tab, payload) → switchTab côté dashboard
 * @returns {{ permission: string, requestPermission: () => Promise<string>, supported: boolean }}
 */
export function useTaskReminders(tasks, chantiers, onNavigate) {
  const [permission, setPermission] = useState(() =>
    isSupported() ? Notification.permission : 'unsupported'
  )

  // Refs : on veut un setInterval stable mais qui lit toujours les dernières
  // tâches sans tout relancer à chaque re-render.
  const tasksRef = useRef(tasks)
  const chantiersRef = useRef(chantiers)
  const onNavigateRef = useRef(onNavigate)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { chantiersRef.current = chantiers }, [chantiers])
  useEffect(() => { onNavigateRef.current = onNavigate }, [onNavigate])

  const requestPermission = useCallback(async () => {
    if (!isSupported()) return 'unsupported'
    try {
      const p = await Notification.requestPermission()
      setPermission(p)
      return p
    } catch {
      return Notification.permission
    }
  }, [])

  const purgeOldKeys = useCallback(() => {
    try {
      const cutoff = Date.now() - KEY_RETENTION_MS
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i)
        if (!k || !k.startsWith(STORAGE_PREFIX)) continue
        const ts = Number(window.localStorage.getItem(k))
        if (Number.isFinite(ts) && ts < cutoff) window.localStorage.removeItem(k)
      }
    } catch { /* localStorage indispo (Safari privé, quota...) → silent */ }
  }, [])

  const scan = useCallback(() => {
    if (!isSupported() || Notification.permission !== 'granted') return
    const triggers = computeReminderTriggers(tasksRef.current, chantiersRef.current)
    for (const trig of triggers) {
      try {
        if (window.localStorage.getItem(trig.dedupKey)) continue
        const n = new Notification(trig.title, {
          body: trig.body,
          tag: trig.dedupKey,
          icon: '/favicon.ico',
          requireInteraction: trig.type === 'overdue',
        })
        n.onclick = () => {
          try { window.focus() } catch {}
          onNavigateRef.current?.('tasks', { entity_id: trig.taskId })
          n.close()
        }
        window.localStorage.setItem(trig.dedupKey, String(Date.now()))
      } catch (err) {
        // Ex : trop de notifs simultanées, navigateur restrictif… on n'arrête
        // pas la boucle pour autant.
        console.warn('[useTaskReminders] notify:', err?.message || err)
      }
    }
  }, [])

  useEffect(() => {
    if (!isSupported()) return
    purgeOldKeys()
    scan()
    const id = setInterval(scan, SCAN_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') scan() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scan, purgeOldKeys])

  return { permission, requestPermission, supported: isSupported() }
}
