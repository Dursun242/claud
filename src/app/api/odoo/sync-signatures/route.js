// Route /api/odoo/sync-signatures — poll Odoo pour mettre à jour les statut_signature
//
// Pour chaque OS en DB avec un odoo_sign_id non null et non encore "Signé",
// on interroge Odoo, on compare et on met à jour statut_signature si le
// nouveau statut diffère. Les triggers SQL (migration 012) génèrent
// automatiquement une notification quand statut_signature change.
//
// Appelable par :
//   - GET /api/odoo/sync-signatures        → tous les OS non finalisés
//   - GET /api/odoo/sync-signatures?osId=X → un seul OS ciblé
//
// Sécurité : JWT Supabase obligatoire.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSignRequestsStatusBulk } from '../../../lib/odoo'
import { verifyAuth } from '@/app/lib/auth'

const FINAL_STATUSES = new Set(['Signé', 'Refusé', 'Expiré', 'Annulé'])

export async function GET(request) {
  const user = await verifyAuth(request)
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const osId = searchParams.get('osId')

  // On exige SERVICE_ROLE_KEY explicitement : un fallback vers ANON_KEY
  // masquerait un défaut de configuration en production (les mises à jour
  // passeraient en mode RLS restreint au lieu de bypass admin).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY manquant côté serveur' },
      { status: 500 }
    )
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // 1. Liste les OS à synchroniser
  let query = supabase
    .from('ordres_service')
    .select('id, numero, odoo_sign_id, statut_signature, statut')
    .not('odoo_sign_id', 'is', null)

  if (osId) {
    query = query.eq('id', osId)
  } else {
    // Ignore ceux déjà finalisés — pas la peine de re-poll
    query = query.not('statut_signature', 'in', `("Signé","Refusé","Expiré","Annulé")`)
  }

  const { data: osRows, error: selErr } = await query
  if (selErr) {
    return NextResponse.json({ error: 'Lecture OS impossible: ' + selErr.message }, { status: 500 })
  }
  if (!osRows?.length) {
    return NextResponse.json({ message: 'Aucun OS à synchroniser', synced: 0, updated: 0 })
  }

  // 2. Batch query Odoo avec tous les requestIds
  const requestIds = osRows.map(o => o.odoo_sign_id).filter(Boolean)
  let statuses
  try {
    statuses = await getSignRequestsStatusBulk(requestIds)
  } catch (err) {
    return NextResponse.json({ error: 'Erreur Odoo: ' + err.message }, { status: 502 })
  }
  const byRequestId = new Map(statuses.map(s => [s.requestId, s]))

  // 3. Compare et met à jour ceux qui ont changé
  const updates = []
  for (const os of osRows) {
    const odoo = byRequestId.get(os.odoo_sign_id)
    if (!odoo) continue
    if (odoo.statut_signature !== os.statut_signature) {
      // On met à jour UNIQUEMENT statut_signature. Le statut principal de
      // l'OS (Brouillon / Émis / En cours / Terminé) n'est pas touché
      // automatiquement — c'est au gérant de le faire évoluer manuellement
      // selon le cycle de vie du chantier, pour éviter les sauts bizarres
      // type "Brouillon → Signé".
      const patch = { statut_signature: odoo.statut_signature }
      const { error: upErr } = await supabase
        .from('ordres_service')
        .update(patch)
        .eq('id', os.id)
      if (upErr) {
        console.warn('[sync-signatures] update échec pour', os.numero, ':', upErr.message)
        continue
      }
      updates.push({
        id: os.id,
        numero: os.numero,
        from: os.statut_signature,
        to: odoo.statut_signature,
        signed_count: odoo.signed_count,
        total_count: odoo.total_count,
      })
    }
  }

  return NextResponse.json({
    message: `Sync terminé : ${osRows.length} OS vérifié(s), ${updates.length} mis à jour`,
    synced: osRows.length,
    updated: updates.length,
    changes: updates,
  })
}
