import { NextResponse } from 'next/server'
import { getSignTemplates, testConnection, inspectModel } from '../../../lib/odoo'
import { verifyAuth } from '@/app/lib/auth'

// GET /api/odoo/templates — liste les templates Odoo Sign
export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const templates = await getSignTemplates()
    // Inspecter les champs sign.template pour le diagnostic
    const fields = await inspectModel('sign.template')
    return NextResponse.json({ templates, _signTemplateFields: Object.keys(fields) })
  } catch (err) {
    console.error('❌ Odoo templates:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/odoo/templates?test=1 — teste la connexion
export async function HEAD(_request) {
  try {
    const info = await testConnection()
    return NextResponse.json(info)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
