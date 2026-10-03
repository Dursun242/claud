// Route /api/cron/qonto-status — vérification périodique des devis Qonto.
//
// Appelée toutes les heures par GitHub Actions (.github/workflows/
// qonto-status.yml), avec l'en-tête Authorization: Bearer <CRON_SECRET>.
// Pour chaque devis du CRM lié à Qonto et encore en attente (Brouillon /
// Envoyé) : accepté dans Qonto → « Accepté » + affaire « Gagné » ; annulé →
// « Refusé ». L'équipe est prévenue (cloche + mail), comme pour une
// signature en ligne.

import crypto from 'node:crypto'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { getQontoToken, listQuotes } from '@/app/lib/qontoServer'
import { notifyTeam, fmtEur } from '@/app/lib/devisNotify'
import { planWorkForDevis, planSummary, planFailure, closeDevisFollowUps } from '@/app/lib/devisWon'

export const maxDuration = 60

const log = createLogger('cron-qonto-status')
const EN_ATTENTE = ['Brouillon', 'Envoyé']

function authorized(request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(String(request.headers.get('authorization') || ''))
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

export async function GET(request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: 'CRON_SECRET non configuré' }, { status: 503 })
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 })
  try {
    const admin = adminClient()
    const token = await getQontoToken(admin)
    if (!token) return Response.json({ ok: true, checked: 0, changes: [], note: 'Qonto non connecté' })

    const { data: rows, error } = await admin.from('crm_devis')
      .select('id, numero, objet, statut, opportunite_id, total_ht, total_ttc, qonto_quote_id')
      .not('qonto_quote_id', 'is', null)
    if (error) return Response.json({ error: 'Lecture des devis impossible : ' + error.message }, { status: 500 })
    const pending = (rows || []).filter(d => EN_ATTENTE.includes(d.statut))
    if (!pending.length) return Response.json({ ok: true, checked: 0, changes: [] })

    const byId = new Map((await listQuotes(token)).map(q => [String(q.id), q]))
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    const changes = []
    for (const d of pending) {
      const q = byId.get(String(d.qonto_quote_id))
      const statut = q?.status === 'approved' ? 'Accepté' : q?.status === 'canceled' ? 'Refusé' : null
      if (!statut) continue
      // Mise à jour conditionnelle : pas de double traitement si le CRM
      // a déjà été mis à jour entre-temps
      const { data: upd, error: upErr } = await admin.from('crm_devis')
        .update({ statut, date_reponse: today }).eq('id', d.id).in('statut', EN_ATTENTE).select('id')
      if (upErr || !upd?.length) continue

      let oppTitre = ''
      let oppEchec = false
      try {
        const { data: opp } = await admin.from('crm_opportunites').select('id, titre, etape').eq('id', d.opportunite_id).maybeSingle()
        oppTitre = opp?.titre || ''
        if (statut === 'Accepté' && opp && !['Gagné', 'Perdu'].includes(opp.etape)) {
          const { error: oppErr } = await admin.from('crm_opportunites').update({
            etape: 'Gagné', probabilite: 100, date_cloture: today, montant_estime: Number(d.total_ht) || null,
          }).eq('id', opp.id)
          if (oppErr) {
            oppEchec = true
            log.warn(`affaire « Gagné » non enregistrée (devis ${d.numero})`, oppErr.message)
          }
        }
      } catch (e) { oppEchec = true; log.warn('affaire', e?.message || e) }

      const accepte = statut === 'Accepté'
      // Réponse reçue : relances soldées (toute l'affaire si accepté)
      await closeDevisFollowUps(admin, d, { wholeOpp: accepte, log })
      // Accepté : chantier (créé si besoin) + tâche « Lancer les travaux »
      const plan = accepte ? await planWorkForDevis(admin, d, { how: 'accepté dans Qonto', log }) : null
      const title = accepte ? `✅ Devis ${d.numero} accepté dans Qonto` : `❌ Devis ${d.numero} annulé dans Qonto`
      await notifyTeam(admin, {
        devisId: d.id,
        title,
        body: [oppTitre || d.objet, `${fmtEur(d.total_ttc)} TTC`].filter(Boolean).join(' · '),
        mailLines: [
          accepte ? 'Un devis vient d’être accepté dans Qonto.' : 'Un devis vient d’être annulé dans Qonto.', '',
          `Devis : ${d.numero}${d.objet ? ` — ${d.objet}` : ''}`,
          oppTitre ? `Affaire : ${oppTitre}` : null,
          `Montant : ${fmtEur(d.total_ht)} HT · ${fmtEur(d.total_ttc)} TTC`, '',
          accepte
            ? (oppEchec
              ? 'Le devis est passé « Accepté » dans le CRM, mais l’affaire n’a pas pu passer « Gagné » : à faire à la main.'
              : 'Le devis est passé « Accepté » et l’affaire « Gagné » dans le CRM.')
            : 'Le devis est passé « Refusé » dans le CRM.',
          planSummary(plan),
          planFailure(plan),
        ],
      }, log)
      changes.push({ numero: d.numero, statut })
    }
    return Response.json({ ok: true, checked: pending.length, changes })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
