// Route /api/conformite — documents administratifs des entreprises (équipe).
// Réservée au staff (verifyStaff). POST { action, … } :
//   prepare  { contactId, kind, name, type, size } → URL de dépôt signée
//   register { contactId, kind, path, name }       → lecture IA + enregistrement
//   update   { id, date_document?, valide_au?, verifie? } → correction à la main
//   delete   { id }
//   url      { id }                                → lien du fichier (5 min)
//   request  { contactId, email? }                 → mail à l'entreprise avec le lien de dépôt
//   relancer { contactIds: [...] }                 → même mail, à plusieurs entreprises (15 max)
//   pause    { contactId, paused, until? }         → suspend / reprend les relances d'une entreprise
//   pause_all { paused }                           → suspend / reprend toutes les relances automatiques
//   verifier { contactId }                         → contrôle légal (annuaire + BODACC) immédiat
//   dossier  { contactId }                         → dossier de vigilance PDF (lien 10 min)
// Logique : lib/conformiteServer.js ; règles : lib/conformite.js.

import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import {
  prepareUpload, registerDocument, updateDocument, deleteDocument, documentUrl, sendRequest,
  setContactPause, setGlobalPause, makeDossier,
} from '@/app/lib/conformiteServer'
import { checkCompany } from '@/app/lib/legalCheckServer'
import { MAX_RELANCES_PAR_PASSAGE } from '@/app/lib/conformite'

export const maxDuration = 60

const log = createLogger('conformite')
const reply = (r) => (r.error
  ? Response.json({ error: r.error }, { status: r.status || 400 })
  : Response.json({ ok: true, data: r.data }))

async function loadContact(admin, id) {
  if (!id) return null
  const { data } = await admin.from('contacts').select('*').eq('id', id).maybeSingle()
  return data || null
}

export async function POST(request) {
  const { user, status } = await verifyStaff(request)
  if (!user) return Response.json({ error: status === 403 ? 'Accès réservé à l’équipe' : 'Non autorisé' }, { status })
  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Requête invalide' }, { status: 400 }) }

  try {
    const admin = adminClient()
    switch (body?.action) {
      case 'prepare': {
        const contact = await loadContact(admin, body.contactId)
        if (!contact) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 })
        return reply(await prepareUpload(admin, { ...body, contactId: contact.id }, log))
      }
      case 'register': {
        const contact = await loadContact(admin, body.contactId)
        if (!contact) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 })
        return reply(await registerDocument(admin, { contact, kind: body.kind, path: body.path, name: body.name, by: 'equipe', log }))
      }
      case 'update':
        return reply(await updateDocument(admin, body, log))
      case 'delete':
        return reply(await deleteDocument(admin, body.id, log))
      case 'url':
        return reply(await documentUrl(admin, body.id))
      case 'request': {
        const contact = await loadContact(admin, body.contactId)
        if (!contact) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 })
        // Adresse sur laquelle l'équipe utilise l'application (pas une variable
        // d'environnement qui peut être fausse) : le lien du mail mène au même site
        const appUrl = new URL(request.url).origin
        return reply(await sendRequest(admin, { contact, email: body.email, appUrl, log }))
      }
      case 'relancer': {
        const ids = [...new Set(Array.isArray(body.contactIds) ? body.contactIds : [])].slice(0, MAX_RELANCES_PAR_PASSAGE)
        if (!ids.length) return Response.json({ error: 'Aucune entreprise' }, { status: 400 })
        const appUrl = new URL(request.url).origin
        const sent = []
        const failed = []
        for (const id of ids) {
          const contact = await loadContact(admin, id)
          if (!contact?.email) { failed.push(contact?.nom || id); continue }
          const r = await sendRequest(admin, { contact, appUrl, log })
          if (r.data?.sent) sent.push(contact.nom)
          else failed.push(contact.nom)
        }
        return Response.json({ ok: true, data: { sent, failed } })
      }
      case 'pause':
        return reply(await setContactPause(admin, { contactId: body.contactId, paused: body.paused === true, until: body.until }, log))
      case 'pause_all':
        return reply(await setGlobalPause(admin, body.paused === true, log))
      case 'verifier':
      case 'dossier': {
        const contact = await loadContact(admin, body.contactId)
        if (!contact) return Response.json({ error: 'Entreprise introuvable' }, { status: 404 })
        return reply(body.action === 'verifier' ? await checkCompany(admin, contact, log) : await makeDossier(admin, contact, log))
      }
      default:
        return Response.json({ error: 'Action inconnue' }, { status: 400 })
    }
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
