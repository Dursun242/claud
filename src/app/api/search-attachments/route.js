// Route /api/search-attachments
//
// GET → Cherche dans les documents (attachments)
//        Paramètres: q (query), chantierId (optionnel)
//
// Retourne: Liste des documents correspondant à la recherche

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function getUserClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, token, { auth: { persistSession: false } })
}

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const chantierId = searchParams.get('chantierId')

    if (!q) {
      return Response.json({ results: [] })
    }

    const supa = getUserClient(request.headers.get('authorization')?.replace('Bearer ', '') || '')

    // Chercher les attachments
    let query = supa
      .from('attachments')
      .select('id, chantier_id, file_name, file_size, created_at, file_path')
      .ilike('file_name', `%${q}%`)

    if (chantierId) {
      query = query.eq('chantier_id', chantierId)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(50)

    if (error) {
      console.error('[search-attachments error]', error)
      return Response.json({ error: 'Erreur recherche' }, { status: 500 })
    }

    // Enrichir avec le type de fichier et le chantier
    const chantierIds = [...new Set(data.map(d => d.chantier_id).filter(Boolean))]
    let chantiers = {}

    if (chantierIds.length) {
      const { data: chantiersData } = await supa
        .from('chantiers')
        .select('id, nom')
        .in('id', chantierIds)

      chantiers = Object.fromEntries(
        (chantiersData || []).map(c => [c.id, c.nom])
      )
    }

    const results = data.map(att => {
      const ext = att.file_name.split('.').pop()?.toLowerCase() || ''
      let type = 'Fichier'
      if (/^(jpg|jpeg|png|gif|webp|heic|heif)$/.test(ext)) type = 'Image'
      else if (ext === 'pdf') type = 'PDF'
      else if (/^(xls|xlsx|csv)$/.test(ext)) type = 'Tableau'
      else if (/^(doc|docx)$/.test(ext)) type = 'Document'
      else if (/^(zip|rar|7z)$/.test(ext)) type = 'Archive'

      return {
        id: att.id,
        file_name: att.file_name,
        file_size: att.file_size,
        type,
        chantier_id: att.chantier_id,
        chantier_nom: chantiers[att.chantier_id] || '—',
        created_at: att.created_at,
        file_path: att.file_path,
      }
    })

    return Response.json({ results, count: results.length })
  } catch (err) {
    console.error('[search-attachments exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
