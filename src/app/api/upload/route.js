import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'
import { userClientFromToken, extractBearerToken } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('upload')

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx']

const TYPE_TO_COL   = { chantier: 'chantier_id', os: 'os_id', cr: 'cr_id', task: 'task_id' }
// Tables réelles Supabase — utilisées pour la vérification d'accès RLS
const TYPE_TO_TABLE = { chantier: 'chantiers', os: 'ordres_service', cr: 'compte_rendus', task: 'taches' }

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

// UUID v4 regex — itemId doit être un UUID Supabase valide
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      log.error('SUPABASE_SERVICE_ROLE_KEY manquant')
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 })
    }

    const formData = await request.formData()
    const file   = formData.get('file')
    const type   = formData.get('type')   // chantier | os | cr | task
    const itemId = formData.get('itemId')

    if (!file || !type || !itemId) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Validation du type (allowlist stricte — prévient path traversal via le champ type)
    if (!TYPE_TO_COL[type]) {
      return Response.json({ error: 'Type invalide' }, { status: 400 })
    }

    // Validation du format itemId (UUID Supabase — prévient path traversal via itemId)
    if (!UUID_RE.test(itemId)) {
      return Response.json({ error: 'itemId invalide' }, { status: 400 })
    }

    // Vérification d'accès IDOR : le client Supabase avec le JWT de l'utilisateur
    // respecte les RLS policies — si l'utilisateur n'a pas accès à cette ressource,
    // Supabase renvoie null et on bloque l'upload avant tout traitement.
    const token = extractBearerToken(request)
    if (!token) return Response.json({ error: 'Token manquant' }, { status: 401 })
    const userSupa = userClientFromToken(token)
    const { data: resource } = await userSupa
      .from(TYPE_TO_TABLE[type])
      .select('id')
      .eq('id', itemId)
      .maybeSingle()
    if (!resource) {
      return Response.json({ error: 'Ressource non trouvée ou accès refusé' }, { status: 403 })
    }

    // Validation MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return Response.json({
        error: 'Type de fichier non autorisé. Formats acceptés : images, PDF, Word, Excel.'
      }, { status: 400 })
    }

    // Validation de l'extension (couche défense supplémentaire contre le spoofing MIME)
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return Response.json({ error: 'Extension de fichier non autorisée.' }, { status: 400 })
    }

    // Validation taille
    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'Fichier trop volumineux (max 20 Mo).' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
      { auth: { persistSession: false } }
    )

    // Construction du chemin avec uniquement des composants validés
    const safeName = `${Date.now()}.${ext}`
    const filePath = `${type}/${itemId}/${safeName}`
    const arrayBuf = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('attachments')
      .upload(filePath, arrayBuf, { contentType: file.type })

    if (uploadError) {
      log.error('storage upload', uploadError.message)
      return Response.json({ error: 'Erreur lors du stockage du fichier.' }, { status: 500 })
    }

    // Enregistrer en base
    const colName = TYPE_TO_COL[type]
    const { error: dbError } = await supabaseAdmin.from('attachments').insert({
      [colName]: itemId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
    })

    if (dbError) {
      log.error('db insert', dbError.message)
      return Response.json({ error: 'Erreur lors de l\'enregistrement du fichier.' }, { status: 500 })
    }

    return Response.json({ ok: true, filePath })
  } catch (e) {
    log.error('exception', e?.message || e)
    return Response.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
