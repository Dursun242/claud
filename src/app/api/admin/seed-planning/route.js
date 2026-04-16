// Route /api/admin/seed-planning
//
// POST → Crée des OS (Ordres de Service) avec dates pour les chantiers démo
//        afin de tester le Planning Gantt
//
// Accès : admin uniquement
// Sécurité : Ne crée des données que pour les chantiers démo connus

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'

function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
}

const DEMO_UUIDS = [
  '11111111-1111-4111-8111-111111111d01', // Villa Moreau
  '22222222-2222-4222-8222-222222222d02', // Maison Petit
  '33333333-3333-4333-8333-333333333d03', // Pharmacie Normandie
]

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

    // Créer des OS de test pour chaque chantier démo
    const today = new Date()
    const testOS = []

    for (const demoId of DEMO_UUIDS) {
      // 3 OS avec dates variées
      const baseDate = new Date(today)
      baseDate.setDate(baseDate.getDate() - 5) // 5 jours dans le passé

      const osData = [
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-001',
          artisan_nom: 'Charpente Test',
          artisan_specialite: 'Charpente',
          statut: 'En cours',
          date_intervention: new Date(baseDate),
          date_fin_prevue: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 jours après
        },
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-002',
          artisan_nom: 'Électricité Test',
          artisan_specialite: 'Électricité',
          statut: 'Émis',
          date_intervention: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 jours dans le futur
          date_fin_prevue: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 jours dans le futur
        },
        {
          chantier_id: demoId,
          numero: 'OS-DEMO-003',
          artisan_nom: 'Plomberie Test',
          artisan_specialite: 'Plomberie',
          statut: 'Signé',
          date_intervention: new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 jours
          date_fin_prevue: new Date(today.getTime() + 22 * 24 * 60 * 60 * 1000), // 22 jours
        },
      ]

      testOS.push(...osData)
    }

    // Insérer les OS de test
    const { error: insertErr } = await supa
      .from('ordres_service')
      .insert(testOS)

    if (insertErr) {
      console.error('[seed-planning insert]', insertErr)
      return Response.json({ error: 'Insertion échouée : ' + insertErr.message }, { status: 500 })
    }

    // Log audit
    await supa.from('activity_logs').insert({
      user_email: user.email?.toLowerCase().trim() || null,
      action: 'seed_planning',
      entity_type: 'system',
      entity_label: `Création de ${testOS.length} OS de test pour le Planning démo`,
    })

    return Response.json({
      ok: true,
      message: `${testOS.length} OS créés pour le Planning démo`,
      count: testOS.length
    })
  } catch (err) {
    console.error('[seed-planning exception]', err)
    return Response.json({ error: 'Erreur serveur: ' + err.message }, { status: 500 })
  }
}
