import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSignTemplates, testConnection } from '../../../lib/odoo'

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

// GET /api/odoo/templates — liste les templates Odoo Sign
export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const templates = await getSignTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    console.error('❌ Odoo templates:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/odoo/templates?test=1 — teste la connexion
export async function HEAD(request) {
  try {
    const info = await testConnection()
    return NextResponse.json(info)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
