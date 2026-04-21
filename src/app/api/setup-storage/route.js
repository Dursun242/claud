import { createClient } from '@supabase/supabase-js'

async function verifyAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.replace('Bearer ', '')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return false

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data } = await adminClient.from('authorized_users').select('role').eq('email', user.email).single()
  return data?.role === 'admin'
}

export async function POST(request) {
  const isAdmin = await verifyAdmin(request)
  if (!isAdmin) return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    // Message générique côté client : pas d'info sur quelle env var manque
    // (évite le fingerprinting). Détail dans les logs serveur.
    console.error('[setup-storage] SUPABASE_SERVICE_ROLE_KEY manquant')
    return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) {
    console.error('[setup-storage] listBuckets:', listError)
    return Response.json({ error: 'Impossible de lister les buckets' }, { status: 500 })
  }

  const exists = (buckets || []).some(b => b.name === 'attachments')

  if (!exists) {
    const { error } = await supabaseAdmin.storage.createBucket('attachments', {
      public: false,
      fileSizeLimit: 20971520,
      allowedMimeTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    })
    if (error) {
      console.error('[setup-storage] createBucket:', error)
      return Response.json({ error: 'Création bucket échouée' }, { status: 500 })
    }
  }

  return Response.json({ ok: true, message: exists ? 'Bucket déjà existant.' : 'Bucket créé avec succès.' })
}
