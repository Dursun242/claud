// Route /api/pv-reception/create
// POST → Crée un PV de réception et l'envoie en signature Odoo (3 signataires)

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/app/lib/auth'
import { createSignRequestFromPdf } from '@/app/lib/odoo'
import { createNotifications } from '@/app/lib/notifications'

function getUserClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, token)
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
}

export async function POST(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const {
      chantierId, numero, titre, description, dateReception,
      signataireMoeEmail, signataireMotEmail, signataireEntrepriseEmail,
      pdfBase64, operationName
    } = body

    if (!chantierId || !numero || !titre) {
      return Response.json({ error: 'Champs requis: chantierId, numero, titre' }, { status: 400 })
    }

    if (!pdfBase64) {
      return Response.json({ error: 'PDF requis pour la signature' }, { status: 400 })
    }

    const supa = adminClient()

    // Créer le PV en base
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
      statut_reception: 'En attente'
    }).select().single()

    if (pvErr) {
      console.error('[pv-creation] insert erreur:', pvErr)
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
        reference: `PV-${numero}`,
        operationName: operationName || `PV Réception - ${titre}`,
        signers
      })
    } catch (signErr) {
      console.error('[pv-creation] Odoo sign erreur:', signErr)
      return Response.json({ error: 'Erreur signature Odoo: ' + signErr.message }, { status: 500 })
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
      console.error('[pv-creation] update erreur:', updateErr)
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
      console.warn('[pv-creation] notification erreur:', notifErr.message)
    }

    return Response.json({
      ok: true,
      pvId: pv.id,
      signUrl: signResult.signUrl,
      message: 'PV créé et envoyé en signature'
    })
  } catch (err) {
    console.error('[pv-creation exception]', err)
    return Response.json({ error: 'Erreur serveur: ' + err.message }, { status: 500 })
  }
}
