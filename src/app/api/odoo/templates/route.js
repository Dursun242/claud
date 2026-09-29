import { NextResponse } from 'next/server'
import { getSignTemplates, testConnection } from '../../../lib/odoo'
import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('odoo-templates')

async function denyUnlessStaff(request) {
  const { user, status } = await verifyStaff(request)
  if (user) return null
  return NextResponse.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
}

// GET /api/odoo/templates — liste les templates Odoo Sign
export async function GET(request) {
  const denied = await denyUnlessStaff(request)
  if (denied) return denied

  try {
    const templates = await getSignTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    log.error('templates', err?.message || err)
    return NextResponse.json({ error: 'Erreur Odoo' }, { status: 500 })
  }
}

// HEAD /api/odoo/templates — teste la connexion
export async function HEAD(request) {
  const denied = await denyUnlessStaff(request)
  if (denied) return denied

  try {
    const info = await testConnection()
    return NextResponse.json(info)
  } catch (err) {
    log.error('test connexion', err?.message || err)
    return NextResponse.json({ error: 'Erreur Odoo' }, { status: 500 })
  }
}
