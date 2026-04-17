// Route /api/odoo/signed-pdf
// GET ?requestId=X → récupère et stream le PDF signé depuis Odoo Sign.
//
// Auth JWT Supabase obligatoire (empêche de drainer Odoo anonymement).
// Le client appelle avec Authorization: Bearer <token>, reçoit le PDF en
// blob, déclenche le téléchargement via URL.createObjectURL().

import { verifyAuth } from '@/app/lib/auth'
import { getCompletedDocument } from '@/app/lib/odoo'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('odoo-signed-pdf')

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const requestId = parseInt(searchParams.get('requestId'), 10)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return Response.json({ error: 'requestId invalide' }, { status: 400 })
    }

    const doc = await getCompletedDocument(requestId)
    if (!doc) {
      return Response.json(
        { error: 'Document signé indisponible — soit la signature n\'est pas encore finalisée, soit Odoo n\'a pas encore généré le PDF final.' },
        { status: 404 }
      )
    }

    // Décodage base64 → bytes pour renvoyer en binaire
    const buffer = Buffer.from(doc.base64, 'base64')
    const safeFilename = (doc.filename || `signature-${requestId}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_')

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': doc.mimetype || 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
