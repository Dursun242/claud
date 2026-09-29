import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'
import { userClientFromToken, extractBearerToken } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('upload')

// type d'upload → table parente (pour le check d'ownership) et colonne FK
const TYPE_TABLES  = { chantier: 'chantiers', os: 'ordres_service', cr: 'compte_rendus', task: 'taches' }
const TYPE_COLUMNS = { chantier: 'chantier_id', os: 'os_id', cr: 'cr_id', task: 'task_id' }

// Type MIME autorisé → extension du fichier stocké. L'extension vient du type
// validé, jamais du nom envoyé par le client (qui finit dans le chemin Storage).
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}
const ALLOWED_TYPES = Object.keys(EXT_BY_TYPE)
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      log.error('SUPABASE_SERVICE_ROLE_KEY manquant')
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 })
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

    if (!TYPE_TABLES[type]) {
      return Response.json({ error: 'Type de ressource invalide' }, { status: 400 })
    }

    // Ownership : on relit la ressource cible avec le JWT de l'utilisateur
    // (RLS appliquée). L'insert plus bas se fait en service role (bypass RLS),
    // donc sans ce check un client MOA pourrait uploader sur n'importe quel
    // chantier en forgeant itemId.
    const userSupa = userClientFromToken(extractBearerToken(request))
    const { data: parent, error: parentError } = await userSupa
      .from(TYPE_TABLES[type])
      .select('id')
      .eq('id', itemId)
      .maybeSingle()
    if (parentError || !parent) {
      return Response.json({ error: 'Ressource non accessible' }, { status: 403 })
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
    const safeName = `${Date.now()}.${EXT_BY_TYPE[file.type]}`
    const filePath = `${type}/${itemId}/${safeName}`
    const arrayBuf = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('attachments')
      .upload(filePath, arrayBuf, { contentType: file.type })

    if (uploadError) {
      log.error('storage', uploadError.message)
      return Response.json({ error: 'Échec de l’envoi du fichier' }, { status: 500 })
    }

    // Enregistrer en base
    const colName = TYPE_COLUMNS[type]
    const { error: dbError } = await supabaseAdmin.from('attachments').insert({
      [colName]: itemId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
    })

    if (dbError) {
      log.error('insert', dbError.message)
      return Response.json({ error: 'Échec de l’enregistrement du fichier' }, { status: 500 })
    }

    return Response.json({ ok: true, filePath })
  } catch (e) {
    log.error('exception', e?.message || e)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
