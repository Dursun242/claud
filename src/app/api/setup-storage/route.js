import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant dans les variables d\'environnement Vercel.' }, { status: 500 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Vérifier si le bucket existe déjà
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()
  if (listError) {
    return Response.json({ error: 'Impossible de lister les buckets : ' + listError.message }, { status: 500 })
  }

  const exists = (buckets || []).some(b => b.name === 'attachments')

  if (!exists) {
    const { error } = await supabaseAdmin.storage.createBucket('attachments', {
      public: false,
      fileSizeLimit: 20971520, // 20 MB
      allowedMimeTypes: ['image/*', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    })
    if (error) {
      return Response.json({ error: 'Création bucket échouée : ' + error.message }, { status: 500 })
    }
  }

  return Response.json({ ok: true, message: exists ? 'Bucket déjà existant.' : 'Bucket créé avec succès.' })
}
