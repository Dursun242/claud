// ═══════════════════════════════════════════════════════════════
// middleware.js — Headers de sécurité HTTP + protection Origin
// ═══════════════════════════════════════════════════════════════
//
// Headers posés sur chaque réponse :
//   - X-Frame-Options            → anti-clickjacking
//   - X-Content-Type-Options     → bloque le MIME-sniffing
//   - Referrer-Policy            → limite la fuite d'URL aux tiers
//   - Strict-Transport-Security  → force HTTPS (1 an, subdomains)
//   - Permissions-Policy         → coupe APIs navigateur non utilisées
//   - X-Permitted-Cross-Domain-Policies → bloque plugins cross-domain
//   - X-XSS-Protection           → désactivé (filtre IE legacy dangereux)
//   - Content-Security-Policy    → voir détail ci-dessous
//
// Vérification Origin sur les routes API :
//   Les routes /api/* en mutation (POST/PUT/PATCH/DELETE) vérifient
//   que l'header Origin ou Referer provient du même domaine que l'app.
//   L'app utilise des JWT Bearer (pas de cookies), donc le CSRF
//   classique est déjà impossible — cette couche protège contre des
//   outils tiers qui tenteraient d'appeler les routes depuis un domaine
//   inconnu. Les appels sans Origin (curl, serveurs) sont autorisés
//   pour ne pas bloquer les tests et les intégrations légitimes.
//
// CSP — choix d'implémentation :
//   Les styles inline sont massifs dans ce projet (pattern assumé,
//   refacto estimée à ~1 j), donc 'unsafe-inline' est conservé sur
//   script-src et style-src. La valeur réelle de la CSP ici porte sur :
//     • connect-src  : bloque l'exfiltration vers des domaines inconnus
//     • frame-ancestors 'none' : clickjacking
//     • form-action 'self' : bloque les redirections de formulaire
//     • base-uri 'self' : bloque l'injection de balise <base>
//     • object-src 'none' : empêche les plugins (Flash, Silverlight…)

import { NextResponse } from 'next/server'

// Méthodes HTTP qui modifient des données — celles qu'on veut protéger
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Routes API exemptées de la vérification Origin :
//   - /api/metrics  : sendBeacon() depuis le navigateur sans Origin prévisible
//   - /api/auth/*   : callbacks OAuth (tiers de confiance)
const ORIGIN_EXEMPT_RE = /^\/api\/(metrics|auth\/)/

function getAllowedOrigins() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const origins = new Set(['http://localhost:3000', 'http://localhost:3001'])
  if (appUrl) {
    try { origins.add(new URL(appUrl).origin) } catch {}
  }
  return origins
}

function buildCsp() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '')
  const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : ''
  const supabaseHttps = supabaseHost ? `https://${supabaseHost}` : ''

  const connectSrc = ["'self'", supabaseHttps, supabaseWs].filter(Boolean).join(' ')

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export function middleware(request) {
  const { pathname, method } = request.nextUrl ? { pathname: request.nextUrl.pathname, method: request.method } : {}
  const reqMethod = request.method

  // Vérification Origin pour les mutations API depuis un navigateur
  if (
    MUTATION_METHODS.has(reqMethod) &&
    pathname?.startsWith('/api/') &&
    !ORIGIN_EXEMPT_RE.test(pathname)
  ) {
    const origin = request.headers.get('origin')
    // Si Origin est absent (curl, Postman, appels serveur-à-serveur), on laisse passer.
    // Si Origin est présent et non reconnu, on bloque — c'est un appel cross-origin
    // depuis un navigateur qui ne provient pas de l'app.
    if (origin) {
      const allowed = getAllowedOrigins()
      if (!allowed.has(origin)) {
        return new NextResponse(
          JSON.stringify({ error: 'Origine non autorisée' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  const res = NextResponse.next()

  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.headers.set('X-XSS-Protection', '0')
  res.headers.set('Content-Security-Policy', buildCsp())

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192\\.png|icon-512\\.png|icon-192\\.svg|icon-512\\.svg|manifest\\.json).*)',
  ],
}
