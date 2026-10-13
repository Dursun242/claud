// Route /api/cr/liens — liens de réponse des entreprises, préparés à l'envoi
// d'un compte rendu (un par entreprise destinataire ayant des actions).
// Le lien mène à /actions/<jeton> (sans compte, 60 jours) ; un lien encore
// valable est réutilisé. Réservée au staff. Sans la migration 046 : 503
// { code: 'MIGRATION_046' }, le CR part sans lien.
//   POST { chantierId, crId, destinataires: [{ email, entreprise, nom }] }
//     → { liens: { [email]: url } }

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import { todayParis } from '@/app/lib/conformiteServer'
import { actionsUrl } from '@/app/lib/crReponse'
import { ensureLien, isMissingTable, MIGRATION_MSG } from '@/app/lib/crReponseServer'

const log = createLogger('cr-liens')
const UUID_RE = /^[0-9a-f-]{36}$/i

export async function POST(request) {
  try {
    const { user, status } = await verifyStaff(request)
    if (!user) return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
    const body = await request.json().catch(() => ({}))
    const chantierId = String(body.chantierId || '')
    if (!UUID_RE.test(chantierId)) return Response.json({ error: 'Chantier requis' }, { status: 400 })
    const crId = UUID_RE.test(String(body.crId || '')) ? body.crId : null
    const dest = (Array.isArray(body.destinataires) ? body.destinataires : []).slice(0, 30)
      .map(d => ({ email: String(d?.email || '').trim().slice(0, 200), entreprise: String(d?.entreprise || '').trim().slice(0, 120), nom: String(d?.nom || '').trim().slice(0, 120) }))
      .filter(d => d.email && d.entreprise)
    const admin = adminClient()
    const today = todayParis()
    const origin = new URL(request.url).origin
    const liens = {}
    for (const d of dest) {
      try {
        liens[d.email] = actionsUrl(origin, await ensureLien(admin, { chantierId, crId, ...d, today }))
      } catch (e) {
        if (isMissingTable(e)) return Response.json({ error: MIGRATION_MSG, code: 'MIGRATION_046' }, { status: 503 })
        log.warn('lien', e?.message || e)
      }
    }
    return Response.json({ liens })
  } catch (err) {
    log.error('liens', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
