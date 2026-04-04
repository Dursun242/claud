import { createClient } from '@supabase/supabase-js'
import { verifyAuth, handleError, successResponse } from '../auth-helpers'

export async function POST(request) {
  try {
    // Verify user is authenticated
    const user = await verifyAuth(request)

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return handleError(
        new Error('SUPABASE_SERVICE_ROLE_KEY missing'),
        500
      )
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
      { auth: { persistSession: false } }
    )

    const formData = await request.formData()
    const file      = formData.get('file')
    const type      = formData.get('type')     // chantier | os | cr | task
    const itemId    = formData.get('itemId')

    if (!file || !type || !itemId) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Validate file size (max 20MB)
    const MAX_FILE_SIZE = 20 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: 'File too large (max 20MB)' }, { status: 413 })
    }

    // Upload to Storage
    const filePath = `${type}/${itemId}/${Date.now()}-${file.name}`
    const arrayBuf = await file.arrayBuffer()
    const { error: uploadError } = await supabaseAdmin.storage
      .from('attachments')
      .upload(filePath, arrayBuf, { contentType: file.type })

    if (uploadError) {
      return handleError(
        new Error('Upload failed: ' + uploadError.message),
        500
      )
    }

    // Save metadata to database
    const colName = { chantier:'chantier_id', os:'os_id', cr:'cr_id', task:'task_id' }[type]
    const { error: dbError } = await supabaseAdmin.from('attachments').insert({
      [colName]: itemId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      uploaded_by_email: user.email,
    })

    if (dbError) {
      return handleError(
        new Error('Database error: ' + dbError.message),
        500
      )
    }

    return successResponse({ ok: true, filePath })
  } catch (e) {
    return handleError(e)
  }
}
