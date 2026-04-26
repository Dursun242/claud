// Route /api/pv-reception/create
// POST → Crée un PV de réception et l'envoie en signature Odoo (3 signataires)

import { verifyAuth } from '@/app/lib/auth'
import { createSignRequestFromPdf } from '@/app/lib/odoo'
import { createNotifications } from '@/app/lib/notifications'
import { adminClient } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'

const log = createLogger('pv-create')

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    // Seuls les admins et salariés peuvent créer des PV.
    const supaForRole = adminClient()
    const { data: caller } = await supaForRole
      .from('authorized_users')
      .select('role')
      .eq('email', user.email?.toLowerCase().trim())
      .maybeSingle()
    if (!caller || !['admin', 'salarié', 'salarie'].includes(caller.role)) {
      return Response.json({ error: 'Accès réservé au personnel de maîtrise d\'œuvre' }, { status: 403 })
    }

    const body = await request.json()
    const {
      chantierId, titre, description, dateReception,
      signataireMoeEmail, signataireMotEmail, signataireEntrepriseEmail,
      pdfBase64, operationName, decision, motifRefus, reservesAcceptation
    } = body

    if (!chantierId || !titre) {
      return Response.json({ error: 'Champs requis: chantierId, titre' }, { status: 400 })
    }

    if (!pdfBase64) {
      return Response.json({ error: 'PDF requis pour la signature' }, { status: 400 })
    }

    if (!signataireMoeEmail || !signataireMotEmail) {
      return Response.json({ error: 'MOE et MOA requis' }, { status: 400 })
    }

    if (decision && !['Accepté', 'Accepté avec réserve', 'Refusé'].includes(decision)) {
      return Response.json({ error: 'Décision invalide' }, { status: 400 })
    }

    if (decision === 'Refusé' && !motifRefus) {
      return Response.json({ error: 'Motif de refus requis' }, { status: 400 })
    }

    if (decision === 'Accepté avec réserve' && !reservesAcceptation) {
      return Response.json({ error: 'Réserves requises' }, { status: 400 })
    }

    const supa = adminClient()

    // Générer le numéro automatiquement: PV-YYYY-XXX
    const now = new Date()
    const year = now.getFullYear()
    const { data: existingPVs, error: countErr } = await supa
      .from('proces_verbaux_reception')
      .select('numero')
      .eq('chantier_id', chantierId)
      .ilike('numero', `PV-${year}-%`)

    if (countErr) log.error('count erreur', countErr.message)
    const nextNum = (existingPVs?.length || 0) + 1
    const numero = `PV-${year}-${String(nextNum).padStart(3, '0')}`

    // Créer le PV en base avec décision immédiate si fournie
    const { data: pv, error: pvErr } = await supa.from('proces_verbaux_reception').insert({
      chantier_id: chantierId,
      numero,
      titre,
      description: description || null,
      date_reception: dateReception || null,
      signataire_moe_email: signataireMoeEmail,
      signataire_moa_email: signataireMotEmail,
      signataire_entreprise_email: signataireEntrepriseEmail,
      statut_signature: 'Brouillon',
      statut_reception: decision && decision !== 'En attente' ? decision : 'En attente',
      motif_refus: (decision === 'Refusé' ? motifRefus : null) || null,
      reserves_acceptation: (decision === 'Accepté avec réserve' ? reservesAcceptation : null) || null,
      decision_immediat: !!decision
    }).select().single()

    if (pvErr) {
      log.error('insert erreur', pvErr.message)
      return Response.json({ error: 'Erreur création PV' }, { status: 500 })
    }

    // Envoyer en signature Odoo avec 3 signataires
    const signers = [
      { name: 'Maître d\'œuvre', email: signataireMoeEmail, role: 'MOE' },
      { name: 'Maître d\'ouvrage', email: signataireMotEmail, role: 'MOA' },
      { name: 'Entreprise', email: signataireEntrepriseEmail, role: 'Entreprise' }
    ].filter(s => s.email)

    if (!signers.length) {
      return Response.json({ error: 'Au moins un signataire requis' }, { status: 400 })
    }

    let signResult
    try {
      signResult = await createSignRequestFromPdf({
        pdfBase64,
        reference: `${numero}`,
        operationName: operationName || `PV Réception - ${titre}`,
        signers
      })
    } catch (signErr) {
      log.error('Odoo sign erreur', signErr.message)
      return Response.json({ error: 'Erreur lors de l\'envoi en signature' }, { status: 500 })
    }

    // Mettre à jour le PV avec les données Odoo Sign
    const { error: updateErr } = await supa
      .from('proces_verbaux_reception')
      .update({
        odoo_sign_id: signResult.requestId,
        odoo_sign_url: signResult.signUrl,
        statut_signature: 'Envoyé'
      })
      .eq('id', pv.id)

    if (updateErr) {
      log.error('update erreur', updateErr.message)
    }

    // Notification
    try {
      await createNotifications({
        entityType: 'pv',
        entityId: pv.id,
        chantierId,
        action: 'create',
        data: { numero, titre },
        actorEmail: user.email
      })
    } catch (notifErr) {
      log.warn('notification erreur', notifErr.message)
    }

    return Response.json({
      ok: true,
      pvId: pv.id,
      numero,
      signUrl: signResult.signUrl,
      message: decision ? `PV créé avec décision: ${decision}` : 'PV créé et envoyé en signature'
    })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
