// Route /api/admin/reset-demo-data
//
// POST → appelle la fonction SQL seed_demo_data() qui purge et recrée
//        le chantier démo "Villa Moreau" avec OS / CR / tâches à neuf.
//
// Accès : admin uniquement.
// Log : trace une entrée activity_logs 'reset_demo'.

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })
    const supa = admin()
    const { data: caller } = await supa
      .from('authorized_users')
      .select('role')
      .eq('email', user.email?.toLowerCase().trim())
      .maybeSingle()
    if (caller?.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 })

    // Appel de la fonction SQL
    const { error: rpcErr } = await supa.rpc('seed_demo_data')
    if (rpcErr) {
      console.error('[reset-demo-data rpc]', rpcErr)
      return Response.json({ error: 'Reset échoué : ' + rpcErr.message }, { status: 500 })
    }

    // Créer les OS de test pour le Planning
    const DEMO_UUIDS = [
      '11111111-1111-4111-8111-111111111d01', // Villa Moreau
      '22222222-2222-4222-8222-222222222d02', // Maison Petit
      '33333333-3333-4333-8333-333333333d03', // Pharmacie Normandie
    ]

    const today = new Date()
    const testOS = []

    for (const demoId of DEMO_UUIDS) {
      const baseDate = new Date(today)
      baseDate.setDate(baseDate.getDate() - 5)

      const osData = [
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-001',
          artisan_nom: 'Charpente Test',
          artisan_specialite: 'Charpente',
          statut: 'En cours',
          date_intervention: baseDate.toISOString().split('T')[0],
          date_fin_prevue: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-002',
          artisan_nom: 'Électricité Test',
          artisan_specialite: 'Électricité',
          statut: 'Émis',
          date_intervention: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          date_fin_prevue: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-003',
          artisan_nom: 'Plomberie Test',
          artisan_specialite: 'Plomberie',
          statut: 'Signé',
          date_intervention: new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          date_fin_prevue: new Date(today.getTime() + 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
      ]

      testOS.push(...osData)
    }

    // Insérer les OS de test
    const { error: insertErr } = await supa
      .from('ordres_service')
      .insert(testOS)

    if (insertErr) {
      console.error('[reset-demo-data insert OS]', insertErr)
      // Continuer même si l'insertion des OS échoue
    }

    // Log audit
    await supa.from('activity_logs').insert({
      user_email: user.email?.toLowerCase().trim() || null,
      action: 'reset_demo',
      entity_type: 'system',
      entity_label: `Réinitialisation des données démo + ${testOS.length} OS Planning`,
    })

    return Response.json({ ok: true, message: 'Données démo réinitialisées + OS Planning créés', count: testOS.length })
  } catch (err) {
    console.error('[reset-demo-data exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
