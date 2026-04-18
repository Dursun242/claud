// Route /api/pv-reception/decision
// POST → Enregistre la décision finale sur un PV (Accepté/Accepté avec réserve/Refusé)

import { verifyAuth } from '@/app/lib/auth'
import { createNotifications } from '@/app/lib/notifications'
import { adminClient } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('pv-decision')

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { pvId, decision, motifRefus } = body

    if (!pvId || !decision) {
      return Response.json({ error: 'pvId et decision requis' }, { status: 400 })
    }

    if (!['Accepté', 'Accepté avec réserve', 'Refusé'].includes(decision)) {
      return Response.json({
        error: 'decision invalide. Accepté, Accepté avec réserve ou Refusé'
      }, { status: 400 })
    }

    if (decision === 'Refusé' && !motifRefus) {
      return Response.json({
        error: 'Motif de refus requis pour un refus'
      }, { status: 400 })
    }

    const supa = adminClient()

    // Récupérer le PV
    const { data: pv, error: getErr } = await supa
      .from('proces_verbaux_reception')
      .select('id, chantier_id, numero, titre, statut_signature')
      .eq('id', pvId)
      .single()

    if (getErr || !pv) {
      return Response.json({ error: 'PV non trouvé' }, { status: 404 })
    }

    // Vérifier que le PV est signé
    if (pv.statut_signature !== 'Signé') {
      return Response.json({
        error: 'Le PV doit être signé avant enregistrer une décision'
      }, { status: 400 })
    }

    // Mettre à jour le PV avec la décision
    const updateData = {
      statut_reception: decision,
      updated_at: new Date().toISOString()
    }

    if (decision === 'Refusé' && motifRefus) {
      updateData.motif_refus = motifRefus
    }

    const { error: updateErr } = await supa
      .from('proces_verbaux_reception')
      .update(updateData)
      .eq('id', pvId)

    if (updateErr) {
      log.error('update erreur', updateErr.message)
      return Response.json({ error: 'Erreur mise à jour PV' }, { status: 500 })
    }

    // Notification
    try {
      await createNotifications({
        entityType: 'pv',
        entityId: pvId,
        chantierId: pv.chantier_id,
        action: 'update',
        data: { numero: pv.numero, titre: pv.titre, decision },
        actorEmail: user.email
      })
    } catch (notifErr) {
      log.warn('notification erreur', notifErr.message)
    }

    return Response.json({
      ok: true,
      decision,
      message: `PV ${pv.numero} - ${decision}`
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur: ' + err.message }, { status: 500 })
  }
}
