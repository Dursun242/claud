import { createClient } from '@supabase/supabase-js'

/**
 * verifyAuth — vérifie qu'une requête API contient un JWT Supabase valide.
 *
 * Utilisé par toutes les API routes de l'app (12/12) pour empêcher
 * les appels anonymes. Pattern unique, importé partout au lieu d'être
 * copié-collé dans chaque route.
 *
 * Fonctionnement :
 * 1. Lit le header Authorization: Bearer <token>
 * 2. Crée un client Supabase côté serveur (anon key, pas de session persistante)
 * 3. Appelle auth.getUser(token) qui valide le JWT côté Supabase
 * 4. Retourne le user objet si valide, null sinon
 *
 * Usage dans une route :
 *   import { verifyAuth } from '@/app/lib/auth'
 *
 *   export async function POST(request) {
 *     const user = await verifyAuth(request)
 *     if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })
 *     // ... suite de la route
 *   }
 *
 * @param {Request} request - L'objet Request Next.js
 * @returns {Promise<object|null>} Le user Supabase ou null si non authentifié
 */
export async function verifyAuth(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    )
    const { data: { user } } = await client.auth.getUser(token)
    return user || null
  } catch {
    return null
  }
}
