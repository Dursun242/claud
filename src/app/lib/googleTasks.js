// ═══════════════════════════════════════════════════════════════
// googleTasks.js — couche d'accès Google Tasks API (server-only)
// ═══════════════════════════════════════════════════════════════
//
// Gère :
//  - lecture / écriture de l'état OAuth (table google_oauth_state)
//  - refresh automatique de l'access_token quand il est expiré
//  - appels REST vers https://tasks.googleapis.com/tasks/v1
//  - mapping des champs entre `taches` (Supabase) et Google Tasks
//
// CE MODULE EST SERVEUR UNIQUEMENT — il importe la service-role key
// via adminClient(). Ne JAMAIS l'importer depuis un composant client.

import { adminClient } from './supabaseClients'
import { createLogger } from './logger'

const log = createLogger('googleTasks')

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'
const LIST_NAME = 'ID Maîtrise'

// Marge de sécurité avant l'expiration réelle pour éviter les requêtes
// avec un token qui expire pile au moment de la latence réseau.
const TOKEN_EXPIRY_MARGIN_MS = 60_000

function env(name) {
  const v = process.env[name]
  if (!v) throw new Error(`[googleTasks] env ${name} manquant`)
  return v
}

// ─── État OAuth ──────────────────────────────────────────────────

export async function getOAuthState() {
  const { data, error } = await adminClient()
    .from('google_oauth_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error('Lecture google_oauth_state: ' + error.message)
  return data
}

export async function saveOAuthState(patch) {
  const sb = adminClient()
  const existing = await getOAuthState()
  if (existing) {
    const { error } = await sb.from('google_oauth_state').update(patch).eq('id', 1)
    if (error) throw new Error('Update google_oauth_state: ' + error.message)
  } else {
    const { error } = await sb.from('google_oauth_state').insert({ id: 1, ...patch })
    if (error) throw new Error('Insert google_oauth_state: ' + error.message)
  }
}

export async function deleteOAuthState() {
  const { error } = await adminClient().from('google_oauth_state').delete().eq('id', 1)
  if (error) throw new Error('Delete google_oauth_state: ' + error.message)
}

// ─── OAuth flow ──────────────────────────────────────────────────

export function buildAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: env('GOOGLE_TASKS_CLIENT_ID'),
    redirect_uri: env('GOOGLE_TASKS_REDIRECT_URI'),
    response_type: 'code',
    scope: TASKS_SCOPE,
    access_type: 'offline',     // pour obtenir un refresh_token
    prompt: 'consent',          // force le consent → refresh_token re-émis même si déjà connecté une fois
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: env('GOOGLE_TASKS_CLIENT_ID'),
    client_secret: env('GOOGLE_TASKS_CLIENT_SECRET'),
    redirect_uri: env('GOOGLE_TASKS_REDIRECT_URI'),
    grant_type: 'authorization_code',
  })
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await res.json()
  if (!res.ok) {
    log.error('exchange code', payload)
    throw new Error('Échange code Google : ' + (payload.error_description || payload.error || res.status))
  }
  return payload // { access_token, refresh_token, expires_in, scope, token_type, id_token? }
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env('GOOGLE_TASKS_CLIENT_ID'),
    client_secret: env('GOOGLE_TASKS_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  })
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await res.json()
  if (!res.ok) {
    log.error('refresh', payload)
    throw new Error('Refresh token Google : ' + (payload.error_description || payload.error || res.status))
  }
  return payload // { access_token, expires_in, scope, token_type }
}

// Récupère un access_token valide. Refresh à la volée si nécessaire et
// persiste le nouveau token + expiration en base.
export async function getAccessToken() {
  const state = await getOAuthState()
  if (!state) throw new Error('Google Tasks non connecté')

  const now = Date.now()
  const expiresAt = state.access_token_expires_at ? new Date(state.access_token_expires_at).getTime() : 0
  if (state.access_token && expiresAt > now + TOKEN_EXPIRY_MARGIN_MS) {
    return state.access_token
  }

  const refreshed = await refreshAccessToken(state.refresh_token)
  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString()
  await saveOAuthState({
    access_token: refreshed.access_token,
    access_token_expires_at: newExpiresAt,
  })
  return refreshed.access_token
}

// ─── Appels Google Tasks API ─────────────────────────────────────

async function gfetch(path, { method = 'GET', body, query } = {}) {
  const token = await getAccessToken()
  const url = new URL(TASKS_API + path)
  if (query) Object.entries(query).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v) })

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  // DELETE renvoie 204 sans body — pas de .json() à appeler.
  if (res.status === 204) return null
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = payload?.error?.message || `HTTP ${res.status}`
    const err = new Error('Google Tasks API : ' + msg)
    err.status = res.status
    err.payload = payload
    throw err
  }
  return payload
}

export async function listTaskLists() {
  return gfetch('/users/@me/lists')
}

export async function createTaskList(title) {
  return gfetch('/users/@me/lists', { method: 'POST', body: { title } })
}

// Récupère l'ID de la liste "ID Maîtrise", la crée si absente, et la
// persiste dans google_oauth_state.tasks_list_id pour les prochains appels.
export async function ensureTasksList() {
  const state = await getOAuthState()
  if (state?.tasks_list_id) return state.tasks_list_id

  const { items = [] } = await listTaskLists()
  const existing = items.find(l => l.title === LIST_NAME)
  const list = existing || await createTaskList(LIST_NAME)
  await saveOAuthState({ tasks_list_id: list.id })
  return list.id
}

export async function listTasks({ listId, updatedMin, showCompleted = true, showDeleted = true, showHidden = true, maxResults = 100, pageToken } = {}) {
  const id = listId || await ensureTasksList()
  return gfetch(`/lists/${id}/tasks`, {
    query: {
      updatedMin,
      showCompleted: showCompleted ? 'true' : 'false',
      showDeleted: showDeleted ? 'true' : 'false',
      showHidden: showHidden ? 'true' : 'false',
      maxResults,
      pageToken,
    },
  })
}

export async function insertTask(taskBody, { listId } = {}) {
  const id = listId || await ensureTasksList()
  return gfetch(`/lists/${id}/tasks`, { method: 'POST', body: taskBody })
}

export async function patchTask(googleTaskId, taskBody, { listId } = {}) {
  const id = listId || await ensureTasksList()
  return gfetch(`/lists/${id}/tasks/${googleTaskId}`, { method: 'PATCH', body: taskBody })
}

export async function deleteTaskGoogle(googleTaskId, { listId } = {}) {
  const id = listId || await ensureTasksList()
  return gfetch(`/lists/${id}/tasks/${googleTaskId}`, { method: 'DELETE' })
}

// ─── Mapping taches Supabase ↔ Google Tasks ──────────────────────

// Les champs `priorite`, `lot`, `chantier_id` ne sont pas modifiables côté
// Google : on les affiche en préfixe de `notes` à titre informatif. Si
// l'utilisateur édite `notes` côté Google, le préfixe est figé côté
// Supabase (on ne re-parse pas notes pour reconstruire ces champs).
export function buildNotesPrefix({ chantierLabel, priorite, lot }) {
  const parts = []
  if (chantierLabel) parts.push('Chantier: ' + chantierLabel)
  if (priorite)      parts.push('Priorité: ' + priorite)
  if (lot)           parts.push('Lot: ' + lot)
  return parts.length ? '[' + parts.join(' | ') + ']' : ''
}

// Convertit une tâche Supabase (ligne `taches`) en payload Google Tasks.
// `chantierLabel` est optionnel et passé par le caller qui résout
// chantier_id → nom de chantier.
export function tacheToGoogleTask(tache, { chantierLabel } = {}) {
  const status = tache.statut === 'fait' ? 'completed' : 'needsAction'
  const due = tache.echeance ? new Date(tache.echeance + 'T00:00:00Z').toISOString() : undefined
  const prefix = buildNotesPrefix({ chantierLabel, priorite: tache.priorite, lot: tache.lot })

  return {
    title: tache.titre || '(sans titre)',
    notes: prefix || undefined,
    due,
    status,
    // Quand on passe en completed, Google met `completed` à un timestamp
    // automatiquement ; on n'a pas besoin de le fixer manuellement.
  }
}

// Convertit une tâche Google (objet renvoyé par l'API) vers les champs
// modifiables côté Supabase (titre, echeance, statut). Les champs
// priorite/lot/chantier_id ne sont JAMAIS dérivés de Google (lecture seule
// côté Google).
export function googleTaskToTachePatch(gtask) {
  const patch = {
    titre: gtask.title || '(sans titre)',
    statut: gtask.status === 'completed' ? 'fait' : 'a_faire',
    google_task_id: gtask.id,
    google_etag: gtask.etag,
    synced_at: new Date().toISOString(),
  }
  if (gtask.due) {
    // Google retourne un ISO complet, on garde la date YYYY-MM-DD.
    patch.echeance = gtask.due.slice(0, 10)
  } else {
    patch.echeance = null
  }
  return patch
}
