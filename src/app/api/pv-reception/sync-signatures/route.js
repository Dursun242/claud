// Route /api/pv-reception/sync-signatures
// GET → Synchronise les signatures Odoo des PV avec la base de données

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'
import { getSignRequestsStatusBulk } from '@/app/lib/odoo'
import { createNotifications } from '@/app/lib/notifications'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
}

export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const supa = adminClient()

    // Récupérer tous les PV en attente de signature
    const { data: pvRows, error } = await supa
      .from('proces_verbaux_reception')
      .select('id, numero, odoo_sign_id, statut_signature, chantier_id')
      .not('odoo_sign_id', 'is', null)
      .not('statut_signature', 'in', '("Signé","Refusé","Expiré","Annulé")')

    if (error) {
      console.error('[pv-sync] select erreur:', error)
      return Response.json({ error: 'Erreur requête' }, { status: 500 })
    }

    if (!pvRows.length) {
      return Response.json({ ok: true, synced: 0, changes: [] })
    }

    const requestIds = pvRows.map(p => p.odoo_sign_id).filter(Boolean)

    // Récupérer les statuts depuis Odoo
    let odooData
    try {
      odooData = await getSignRequestsStatusBulk(requestIds)
    } catch (odooErr) {
      console.error('[pv-sync] Odoo erreur:', odooErr.message)
      return Response.json({ error: 'Erreur Odoo: ' + odooErr.message }, { status: 500 })
    }

    const byRequestId = new Map(odooData.map(o => [o.requestId, o]))
    const changes = []

    // Mettre à jour chaque PV
    for (const pv of pvRows) {
      const odoo = byRequestId.get(pv.odoo_sign_id)
      if (!odoo) continue

      if (odoo.statut !== pv.statut_signature) {
        const patch = { statut_signature: odoo.statut }

        const { error: upErr } = await supa
          .from('proces_verbaux_reception')
          .update(patch)
          .eq('id', pv.id)

        if (upErr) {
          console.warn('[pv-sync] update échec pour', pv.numero, ':', upErr.message)
        } else {
          changes.push({
            pvId: pv.id,
            numero: pv.numero,
            from: pv.statut_signature,
            to: odoo.statut,
            signed_count: odoo.signed_count
          })

          // Notification si changement de statut
          if (odoo.statut === 'Signé') {
            try {
              await createNotifications({
                entityType: 'pv',
                entityId: pv.id,
                chantierId: pv.chantier_id,
                action: 'update',
                data: { numero: pv.numero, statut: 'Signé' },
                actorEmail: null
              })
            } catch (_) {}
          }
        }
      }
    }

    return Response.json({
      ok: true,
      synced: pvRows.length,
      changes: changes,
      message: `${changes.length} PV(s) mis à jour`
    })
  } catch (err) {
    console.error('[pv-sync exception]', err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
