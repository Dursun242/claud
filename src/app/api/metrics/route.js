// Route /api/metrics
// POST → Ingère les beacons Web Vitals envoyés par src/app/web-vitals.js
//        (LCP, CLS, INP, FCP, TTFB).
//
// Choix d'implémentation :
//   - Pas d'auth : les beacons partent via navigator.sendBeacon() dont on ne
//     maîtrise pas les headers, et les métriques n'exposent rien de sensible.
//   - Pas de persistance dédiée : on logge avec createLogger(), ce qui les
//     capture dans les logs Vercel. Si on veut un tableau de bord plus tard,
//     il suffira de brancher Sentry/Datadog/Axiom ici — l'endpoint reste
//     stable.
//   - Ignore silencieusement les corps mal formés pour ne pas polluer les
//     logs d'erreur si un bot ou un navigateur exotique envoie du bruit.

import { createLogger } from '@/app/lib/logger'

const log = createLogger('web-vitals')

// Core Web Vitals officiels + quelques métriques secondaires supportées par
// next/web-vitals. On ignore tout ce qui n'est pas dans cette liste.
const KNOWN_METRICS = new Set([
  'LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'FID',
  'Next.js-hydration', 'Next.js-route-change-to-render', 'Next.js-render',
])

// Garde-fou taille : un beacon Web Vitals typique fait < 500 octets.
// On rejette tout corps > 4 Ko pour éviter un DoS par logs volumineux.
const MAX_BODY_BYTES = 4 * 1024

export async function POST(request) {
  try {
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 })
    }

    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(null, { status: 413 })
    }

    let metric
    try { metric = JSON.parse(raw) }
    catch { return new Response(null, { status: 204 }) }

    if (!metric || typeof metric.name !== 'string' || !KNOWN_METRICS.has(metric.name)) {
      return new Response(null, { status: 204 })
    }

    const value = Number.isFinite(metric.value) ? Math.round(metric.value) : null
    log.info(metric.name, {
      value,
      rating: metric.rating || null,
      id: metric.id || null,
      navigationType: metric.navigationType || null,
    })

    // sendBeacon ignore la réponse → on renvoie 204 (pas de body).
    return new Response(null, { status: 204 })
  } catch (err) {
    log.error('ingest', err?.message || err)
    return new Response(null, { status: 204 })
  }
}
