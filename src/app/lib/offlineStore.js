// ═══════════════════════════════════════════════════════════════
// offlineStore.js — stockage local pour l'usage hors ligne (chantier)
// ═══════════════════════════════════════════════════════════════
//
//  - Cache des données (IndexedDB, clone structuré : Map/Set conservés) :
//    dernière version des données consultées, relue au démarrage.
//  - File d'attente (localStorage) : modifications faites sans réseau,
//    envoyées au retour de la connexion.
//
// Tout est rangé par utilisateur (email) et effacé à la déconnexion.
// Sans IndexedDB / localStorage (navigation privée, tests), tout devient
// silencieusement sans effet.

const DB_NAME = 'idm-offline'
const STORE = 'kv'
const OUTBOX_PREFIX = 'idm_outbox:'

let dbPromise = null
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch { resolve(null) }
    })
  }
  return dbPromise
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined)
    try {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      t.oncomplete = () => resolve(req?.result)
      t.onerror = () => resolve(undefined)
      t.onabort = () => resolve(undefined)
    } catch { resolve(undefined) }
  }))
}

export const cacheGet = (key) => tx('readonly', (s) => s.get(key))
export const cacheSet = (key, value) => tx('readwrite', (s) => s.put(value, key))
export const cacheDelete = (key) => tx('readwrite', (s) => s.delete(key))
const cacheClearAll = () => tx('readwrite', (s) => s.clear())

// ─── File d'attente ───
const outboxKey = (email) => OUTBOX_PREFIX + String(email || '').toLowerCase().trim()

export function readOutbox(email) {
  try { return JSON.parse(localStorage.getItem(outboxKey(email)) || '[]') } catch { return [] }
}
export const OUTBOX_EVENT = 'idm-outbox-change'
// Retourne false si la file n'a pas pu être écrite (stockage plein, bloqué…).
function writeOutbox(email, ops) {
  try {
    if (ops.length) localStorage.setItem(outboxKey(email), JSON.stringify(ops))
    else localStorage.removeItem(outboxKey(email))
  } catch { return false }
  try { window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { count: ops.length } })) } catch {}
  return true
}

/**
 * Ajoute une modification à envoyer plus tard. `dedupeKey` : une seule
 * opération en attente par clé (ex. « task:<id> ») — la dernière gagne.
 * Lève si la file n'a pas pu être enregistrée sur l'appareil.
 */
export function enqueue(email, { type, payload, dedupeKey }) {
  const ops = readOutbox(email).filter(op => !dedupeKey || op.dedupeKey !== dedupeKey)
  ops.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, payload, dedupeKey: dedupeKey || null, ts: Date.now() })
  if (!writeOutbox(email, ops)) {
    throw new Error("Hors ligne : modification non enregistrée sur l'appareil (stockage plein ou bloqué)")
  }
  return ops.length
}

/**
 * Envoie les opérations en attente, dans l'ordre. `handlers[type](payload)`
 * doit lever en cas d'échec : l'opération reste alors en file (et les
 * suivantes aussi, pour garder l'ordre). Une opération sans handler (type
 * inconnu de cette version) est traitée comme un échec : gardée en file,
 * jamais jetée sans avoir été envoyée. Retourne { sent, remaining }.
 */
export async function flushOutbox(email, handlers) {
  let ops = readOutbox(email)
  let sent = 0
  while (ops.length) {
    const op = ops[0]
    const handler = handlers[op.type]
    if (!handler) break
    try { await handler(op.payload) } catch { break }
    sent++
    // Relit la file : une opération a pu être ajoutée pendant l'envoi
    ops = readOutbox(email).filter(o => o.id !== op.id)
    if (!writeOutbox(email, ops)) { ops = readOutbox(email); break }
  }
  return { sent, remaining: ops.length }
}

/**
 * Efface les données consultables stockées sur l'appareil (déconnexion) :
 * cache des données et profil. La file d'attente est conservée : ce sont
 * des modifications pas encore envoyées, elles partiront à la prochaine
 * connexion du même utilisateur.
 */
export async function clearOfflineData() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('idm_profile:')) localStorage.removeItem(k)
    }
  } catch {}
  await cacheClearAll()
}

/** Erreur due au réseau (et non à une règle métier / droits). */
export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err?.message || err || '')
  return /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed/i.test(msg)
}
