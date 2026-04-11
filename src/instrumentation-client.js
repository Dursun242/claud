// ═══════════════════════════════════════════════════════════════
// Sentry — initialisation côté client (browser)
// ═══════════════════════════════════════════════════════════════
//
// Ce fichier est automatiquement chargé par Next.js 15+ au démarrage
// de l'app côté client. Il initialise Sentry pour capturer :
// - Les exceptions React non gérées (via ErrorBoundary)
// - Les rejets de Promise non gérés
// - Les erreurs dans les event handlers (onClick, onChange…)
//
// Si NEXT_PUBLIC_SENTRY_DSN n'est pas défini, Sentry n'est pas
// initialisé et l'app fonctionne normalement sans monitoring.
//
// Le SDK Sentry est toujours importé (il pèse ~50 KB) mais si
// non-initialisé, tous les appels captureException() sont des no-op.

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // Pas de performance tracing — on veut juste la capture d'erreurs,
    // pas le profiling (qui coûte du quota et crée du bruit).
    tracesSampleRate: 0,

    // Pas de session replay — l'app manipule des données client/chantiers
    // potentiellement confidentielles, on évite d'enregistrer la vidéo
    // des sessions. À réactiver plus tard si besoin (avec du PII masking).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Filtre le bruit qu'on ne peut pas corriger de toute façon :
    // extensions navigateur, ResizeObserver warnings, AbortError sur
    // des fetchs annulés volontairement, etc.
    ignoreErrors: [
      // Browser extensions / userscripts
      'top.GLOBALS',
      // ResizeObserver warnings (inoffensif, spamme les logs)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors déjà gérées côté UI via toasts
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      // User cancelled an operation volontairement
      'AbortError',
      'The user aborted a request',
      // Safari privé mode localStorage quota
      'QuotaExceededError',
    ],
  })
}

// Permet au router Next.js de rapporter les transitions de page
// à Sentry (utile pour les stack traces en cas d'erreur au milieu d'une navigation)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
