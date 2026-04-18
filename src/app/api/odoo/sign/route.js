import { NextResponse } from 'next/server'
import { createSignRequest, createSignRequestFromPdf, getSignRequestStatus } from '@/app/lib/odoo'
import { verifyAuth } from '@/app/lib/auth'
import { adminClient } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('odoo-sign')

// POST /api/odoo/sign — crée une demande de signature pour un OS
export async function POST(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const body = await request.json()
    const { reference, osId, pdfBase64, signers, operationName } = body

    // Validation : au moins un signataire avec email
    if (!signers?.length && !body.signerEmail) {
      return NextResponse.json({ error: 'Au moins un signataire requis' }, { status: 400 })
    }

    let result
    if (pdfBase64) {
      // Nouveau flux 3 signataires
      const signersResolved = signers?.length
        ? signers
        : [{ name: body.signerName, email: body.signerEmail, role: 'Entreprise' }]
      result = await createSignRequestFromPdf({ pdfBase64, reference, operationName, signers: signersResolved })
    } else {
      const { signerName, signerEmail, templateId } = body
      if (!templateId) return NextResponse.json({ error: 'templateId ou pdfBase64 requis' }, { status: 400 })
      result = await createSignRequest({ templateId, signerName, signerEmail, reference })
    }

    // Mettre à jour l'OS dans Supabase avec l'ID de la demande Odoo.
    // adminClient() exige SUPABASE_SERVICE_ROLE_KEY et jette sinon — on
    // évite tout fallback silencieux qui masquerait un défaut de config.
    if (osId) {
      const supabase = adminClient()
      await supabase.from('ordres_service').update({
        odoo_sign_id: result.requestId,
        odoo_sign_url: result.signUrl,
        statut_signature: 'Envoyé',
      }).eq('id', osId)
    }

    return NextResponse.json(result)
  } catch (err) {
    log.error('sign', err?.message || err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/odoo/sign?requestId=123 — vérifie le statut d'une signature
export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const requestId = parseInt(searchParams.get('requestId'), 10)
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return NextResponse.json({ error: 'requestId invalide' }, { status: 400 })
  }

  try {
    const status = await getSignRequestStatus(requestId)
    return NextResponse.json(status)
  } catch (err) {
    log.error('get status', err?.message || err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
