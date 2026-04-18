// ═══════════════════════════════════════════════════════════════
// supabaseClients.js — factories centralisées pour créer des clients
// Supabase côté serveur (routes API Next.js).
// ═══════════════════════════════════════════════════════════════
//
// Pourquoi : avant ce fichier, chaque route API réimplémentait sa propre
// factory. Résultat : 2 routes avaient le bug "JWT passé en 2e arg à la
// place de l'ANON_KEY", contournant silencieusement les RLS.
//
// Règles d'usage :
//
//   adminClient()
//     → Client service-role, bypasse les RLS. N'utiliser QUE pour les
//       écritures backend qui ne peuvent pas être couvertes par RLS
//       (insert avec génération de numéro, mise à jour post-signature…).
//
//   userClientFromToken(token)
//     → Client anon avec JWT propagé dans l'en-tête Authorization.
//       Les policies RLS voient auth.uid() correctement.
//       À préférer pour toute LECTURE (respect automatique des droits).
//
// Ne PAS instancier createClient(url, token) directement : le 2e arg est
// la clé d'API, pas le JWT. C'est la cause du bug qu'on a eu sur
// /api/pv-reception/list et /api/search-attachments.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Client service-role (bypass RLS).
 * Jette si SUPABASE_SERVICE_ROLE_KEY n'est pas configurée — on préfère
 * une erreur bruyante plutôt qu'un fallback silencieux vers l'anon key
 * qui masquerait un défaut de config en prod.
 */
export function adminClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant côté serveur')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Client "utilisateur" : clé anon + JWT dans le header Authorization.
 * Les RLS policies voient auth.uid() du user courant.
 * @param {string} token — JWT Supabase (access_token)
 */
export function userClientFromToken(token) {
  if (!token) {
    throw new Error('JWT manquant pour userClientFromToken')
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Helper pratique : extrait le JWT du header Authorization d'une Request
 * Next.js. Retourne null si absent ou mal formé.
 */
export function extractBearerToken(request) {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!raw) return null
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}
