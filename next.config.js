/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

// ═══════════════════════════════════════════════════════════════
// Sentry wrapper — active le monitoring d'erreurs en prod
// ═══════════════════════════════════════════════════════════════
//
// withSentryConfig :
// - Injecte le SDK Sentry dans le bundle client et server
// - Upload les source maps à Sentry (seulement si SENTRY_AUTH_TOKEN défini)
// - Cache les source maps publiques (clients ne peuvent pas lire le code source)
//
// Si SENTRY_AUTH_TOKEN n'est pas défini (dev local, PRs, fork…), le
// wrapper s'exécute mais ne fait rien d'utile : pas d'upload, pas d'erreur.
// Le comportement de l'app est strictement identique.
//
// Si NEXT_PUBLIC_SENTRY_DSN n'est pas défini à runtime, Sentry est
// initialisé à vide → tous les captureException() sont des no-op.

const { withSentryConfig } = require('@sentry/nextjs')

module.exports = withSentryConfig(nextConfig, {
  // Org et project slugs Sentry (depuis les env vars)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Silence Sentry pendant le build si pas d'auth token (dev builds)
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Upload des source maps des chunks Webpack (y compris ceux chargés
  // dynamiquement comme jsPDF). Ne fait rien sans SENTRY_AUTH_TOKEN.
  widenClientFileUpload: true,

  // Masque les source maps dans le bundle publié — elles ne sont
  // accessibles qu'à Sentry pour dé-minifier les stack traces.
  hideSourceMaps: true,

  // Retire le logger Sentry du bundle client (~2 KB économisés)
  disableLogger: true,

  // Annotate React components → de meilleurs noms dans les stack traces
  // (« <ContactsV> a levé une erreur à la ligne X » au lieu de « Anonymous »)
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route tunnel pour bypasser les ad-blockers qui bloquent sentry.io
  // (utile côté client)
  tunnelRoute: '/monitoring',
})
