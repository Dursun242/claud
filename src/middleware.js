// ═══════════════════════════════════════════════════════════════
// middleware.js — Headers de sécurité HTTP
// ═══════════════════════════════════════════════════════════════
//
// Ajoute un jeu minimal de headers de sécurité à chaque réponse HTTP :
//   - X-Frame-Options: DENY          → anti-clickjacking
//   - X-Content-Type-Options: nosniff → bloque le MIME-sniffing
//   - Referrer-Policy                → limite la fuite d'URL aux tiers
//   - Strict-Transport-Security      → force HTTPS (1 an, subdomains)
//   - Permissions-Policy             → coupe APIs navigateur non utilisées
//
// Pas de CSP pour l'instant : l'app utilise du style inline massif
// (pattern assumé par le projet) + Google Fonts + Supabase realtime.
// Une CSP propre nécessite un audit dédié (nonces sur les <style>
// inline, liste des domaines Supabase/Anthropic/Qonto…). À traiter
// dans un second round.

import { NextResponse } from 'next/server'

export function middleware() {
  const res = NextResponse.next()

  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )
  // Désactive les APIs navigateur qu'on n'utilise pas (ou seulement
  // ponctuellement via le mic flottant, qui fonctionne sur localhost
  // et same-origin sans permission particulière).
  res.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()'
  )

  return res
}

// On exclut les assets statiques et les endpoints de health de Next :
// pas de valeur à les headers-ifier, et ça évite un overhead inutile.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-192\\.png|icon-512\\.png|icon-192\\.svg|icon-512\\.svg|manifest\\.json).*)',
  ],
}
