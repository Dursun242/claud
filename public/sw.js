// Service worker ID Maîtrise — ouverture de l'application sans réseau.
//
//  - Page d'accueil « / » (l'application) : réseau d'abord, dernière version
//    enregistrée si hors ligne.
//  - /_next/static/* (fichiers versionnés par empreinte) : cache d'abord.
//  - Icônes, manifest, images : cache puis mise à jour en arrière-plan.
//  - Tout le reste (API, Supabase, pages de signature…) : non intercepté.
//
// Les données (chantiers, OS…) ne passent pas par ici : elles sont gardées
// par l'application elle-même (IndexedDB, lib/offlineCache.js).

const VERSION = 'idm-v1'
const SHELL = `${VERSION}-shell`
const STATIC = `${VERSION}-static`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL)
      cache.put('/', response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match('/')
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => { if (response.ok) cache.put(request, response.clone()); return response })
    .catch(() => cached)
  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    if (url.pathname === '/') event.respondWith(networkFirst(request))
    return
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (/^\/(icon-[^/]+|favicon\.ico|manifest\.json|images\/.+)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
