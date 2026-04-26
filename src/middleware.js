// ═══════════════════════════════════════════════════════════════
// middleware.js — Headers de sécurité HTTP
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
// CSP — choix d'implémentation :
//   Les styles inline sont massifs dans ce projet (pattern assumé,
//   refacto estimée à ~1 j), donc 'unsafe-inline' est conservé sur
//   script-src et style-src. La valeur réelle de la CSP ici porte sur :
//     • connect-src  : bloque l'exfiltration vers des domaines inconnus
//     • frame-ancestors 'none' : clickjacking (redondant avec X-Frame-Options
//       mais CSP est prioritaire sur les navigateurs modernes)
//     • form-action 'self' : bloque les attaques de redirection de formulaire
//     • base-uri 'self' : bloque l'injection de balise <base>
//     • object-src 'none' : empêche les plugins (Flash, Silverlight…)
//   Chemin vers une CSP stricte : ajouter des nonces Next.js sur les
//   scripts inline, puis supprimer 'unsafe-inline' de script-src.

import { NextResponse } from 'next/server'

// Domaines Supabase utilisés côté client (REST, Storage, Realtime WS).
// La variable est lue dynamiquement pour fonctionner en dev et en prod.
function buildCsp() {
  // Extrait juste le hostname du projet Supabase (ex: abcdefgh.supabase.co)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '')
  // WS Realtime : même hostname, protocole wss://
  const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : ''
  const supabaseHttps = supabaseHost ? `https://${supabaseHost}` : ''

  const connectSrc = [
    "'self'",
    supabaseHttps,
    supabaseWs,
  ].filter(Boolean).join(' ')

  return [
    "default-src 'self'",
    // 'unsafe-inline' requis tant que les styles/scripts inline ne sont pas
    // migrés vers des classes ou des nonces.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Polices : auto-hébergées via next/font (pas de appel externe)
    "font-src 'self'",
    // Images : same-origin + data URIs (previews) + blob (FileReader) +
    // HTTPS pour les signed URLs Supabase Storage
    "img-src 'self' data: blob: https:",
    // Audio : microphone flottant génère des blob: URLs
    "media-src 'self' blob:",
    // Connexions réseau côté client : uniquement l'app + Supabase
    `connect-src ${connectSrc}`,
    // Iframes interdites (redondant avec X-Frame-Options mais prioritaire)
    "frame-src 'none'",
    "frame-ancestors 'none'",
    // Protections structurelles
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export function middleware() {
  const res = NextResponse.next()

  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )
  res.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()'
  )
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.headers.set('X-XSS-Protection', '0')
  res.headers.set('Content-Security-Policy', buildCsp())

  return res
}

// On exclut les assets statiques et les endpoints de health de Next :
// pas de valeur à les headers-ifier, et ça évite un overhead inutile.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192\\.png|icon-512\\.png|icon-192\\.svg|icon-512\\.svg|manifest\\.json).*)',
  ],
}
