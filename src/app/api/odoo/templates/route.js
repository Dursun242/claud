import { NextResponse } from 'next/server'
import { getSignTemplates, testConnection } from '../../../lib/odoo'
import { verifyAuth } from '@/app/lib/auth'

// GET /api/odoo/templates — liste les templates Odoo Sign
export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const templates = await getSignTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('[odoo-templates GET]', err?.message || err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// HEAD /api/odoo/templates — teste la connexion Odoo
export async function HEAD(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const info = await testConnection()
    return NextResponse.json(info)
  } catch (err) {
    console.error('[odoo-templates HEAD]', err?.message || err)
    return NextResponse.json({ error: 'Erreur connexion Odoo' }, { status: 500 })
  }
}
