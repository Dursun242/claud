import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSignRequest, createSignRequestFromPdf, getSignRequestStatus } from '../../../lib/odoo'

async function verifyAuth(request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { data: { user } } = await client.auth.getUser(token)
  return user || null
}

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

    // Mettre à jour l'OS dans Supabase avec l'ID de la demande Odoo
    if (osId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
      await supabase.from('ordres_service').update({
        odoo_sign_id: result.requestId,
        odoo_sign_url: result.signUrl,
        statut_signature: 'Envoyé',
      }).eq('id', osId)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('❌ Odoo sign:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/odoo/sign?requestId=123 — vérifie le statut d'une signature
export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const requestId = parseInt(searchParams.get('requestId'))
  if (!requestId) return NextResponse.json({ error: 'requestId requis' }, { status: 400 })

  try {
    const status = await getSignRequestStatus(requestId)
    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
