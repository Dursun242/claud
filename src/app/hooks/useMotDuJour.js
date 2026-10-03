'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { MOT_DU_JOUR_SYSTEM, prioritiesDigest, hashText, motDuJourPrompt, cleanMotDuJour } from '../lib/priorities'

// « Le mot du jour » : une ou deux phrases de l'assistant IA (/api/claude)
// sur les priorités du jour. Un seul appel par utilisateur, par jour et par
// liste : le texte est gardé dans localStorage sous
// mot-du-jour:<user>:<AAAA-MM-JJ>:<hash de la liste>. Pas d'appel hors
// ligne ni sans priorité ; en cas d'erreur on n'affiche rien (pas de toast).

const PREFIX = 'mot-du-jour:'
const pending = new Map() // clé → Promise (évite un double appel au remontage)
const failed = new Set()  // clés en échec pendant cette session
const memory = new Map()  // secours si localStorage est indisponible

function readCache(key) {
  if (!key) return ''
  try { return window.localStorage.getItem(key) || memory.get(key) || '' } catch { return memory.get(key) || '' }
}

// Enregistre le texte et efface ceux des jours précédents de cet
// utilisateur (ceux du jour restent : la liste peut revenir à un état connu)
function writeCache(key, text, userPrefix, dayPrefix) {
  memory.set(key, text)
  try {
    const ls = window.localStorage
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i)
      if (k && k.startsWith(userPrefix) && !k.startsWith(dayPrefix)) ls.removeItem(k)
    }
    ls.setItem(key, text)
  } catch { /* stockage indisponible : on garde le texte en mémoire seulement */ }
}

async function fetchMot(digest) {
  const { data: { session } = {} } = await supabase.auth.getSession()
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({
      max_tokens: 150,
      system: MOT_DU_JOUR_SYSTEM,
      messages: [{ role: 'user', content: motDuJourPrompt(digest) }],
    }),
  })
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const json = await res.json()
  return cleanMotDuJour((json.content || []).map(c => c?.text || '').join(' '))
}

/**
 * @param {object}  p
 * @param {Array}   p.items   priorités affichées (top)
 * @param {number}  p.total   nombre total de priorités
 * @param {string}  p.userId
 * @param {string}  p.today   AAAA-MM-JJ
 * @returns {string} la phrase, ou '' tant qu'elle n'est pas disponible
 */
export function useMotDuJour({ items = [], total = 0, userId, today, enabled = true }) {
  const digest = useMemo(() => (items.length ? prioritiesDigest(items, total) : ''), [items, total])
  const userPrefix = `${PREFIX}${userId || 'anon'}:`
  const dayPrefix = `${userPrefix}${today}:`
  const key = digest ? `${dayPrefix}${hashText(digest)}` : null
  const [state, setState] = useState(() => ({ key, text: readCache(key) }))

  useEffect(() => {
    if (!key) return undefined
    // Pas d'appel tant que la liste n'est pas définitive (chargement en
    // plusieurs étapes) ; un texte déjà en cache s'affiche quand même.
    if (!enabled) {
      const cached = readCache(key)
      if (cached) setState({ key, text: cached })
      return undefined
    }
    const cached = readCache(key)
    if (cached) { setState({ key, text: cached }); return undefined }
    if (failed.has(key)) return undefined
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined
    let alive = true
    let p = pending.get(key)
    if (!p) {
      p = fetchMot(digest)
        .then(text => { if (text) writeCache(key, text, userPrefix, dayPrefix); return text })
        .catch(() => { failed.add(key); return '' })
        .finally(() => pending.delete(key))
      pending.set(key, p)
    }
    p.then(text => { if (alive && text) setState({ key, text }) })
    return () => { alive = false }
  }, [key, digest, userPrefix, dayPrefix, enabled])

  return state.key === key ? state.text : ''
}
