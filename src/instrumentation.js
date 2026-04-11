// ═══════════════════════════════════════════════════════════════
// Next.js instrumentation hook — runs once at server startup.
// Used to initialize Sentry for server and edge runtimes.
// ═══════════════════════════════════════════════════════════════
//
// Documentation :
//   https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//   https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// Côté client, Sentry est initialisé via src/instrumentation-client.js.
// Côté serveur, c'est ici — on branche différemment selon le runtime
// (nodejs pour les API routes classiques, edge pour les routes edge).
//
// Si NEXT_PUBLIC_SENTRY_DSN n'est pas défini, Sentry n'est pas initialisé
// et l'app fonctionne normalement sans monitoring (no-op silencieux).

export async function register() {
  const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
  if (!SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Error capture only — pas de performance tracing pour économiser
      // le quota gratuit et éviter le bruit. On pourra activer plus tard
      // avec tracesSampleRate: 0.1 si besoin.
      tracesSampleRate: 0,
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs')
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0,
    })
  }
}

// Hook Next.js 15 : capture les erreurs des API routes et server components.
// Sans ça, les erreurs serveur ne remontent pas à Sentry.
export async function onRequestError(err, request, context) {
  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(err, request, context)
}
