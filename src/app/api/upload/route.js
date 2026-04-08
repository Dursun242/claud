import { createClient } from '@supabase/supabase-js'

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

async function verifyAuth(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { data: { user } } = await client.auth.getUser(token)
  return user || null
}

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
      { auth: { persistSession: false } }
    )

    const formData = await request.formData()
    const file    = formData.get('file')
    const type    = formData.get('type')   // chantier | os | cr | task
    const itemId  = formData.get('itemId')

    if (!file || !type || !itemId) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Validation type de fichier
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({
        error: `Type de fichier non autorisé (${file.type}). Formats acceptés : images, PDF, Word, Excel.`
      }, { status: 400 })
    }

    // Validation taille
    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'Fichier trop volumineux (max 20 Mo).' }, { status: 400 })
    }

    // Upload vers Storage
    const ext = file.name.split('.').pop()
    const safeName = `${Date.now()}.${ext}`
    const filePath = `${type}/${itemId}/${safeName}`
    const arrayBuf = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('attachments')
      .upload(filePath, arrayBuf, { contentType: file.type })

    if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 })

    // Enregistrer en base
    const colName = { chantier: 'chantier_id', os: 'os_id', cr: 'cr_id', task: 'task_id' }[type]
    const { error: dbError } = await supabaseAdmin.from('attachments').insert({
      [colName]: itemId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
    })

    if (dbError) return Response.json({ error: dbError.message }, { status: 500 })

    return Response.json({ ok: true, filePath })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
