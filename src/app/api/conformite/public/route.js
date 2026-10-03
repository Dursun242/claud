// Route /api/conformite/public — page publique de dépôt des documents
// (/deposer/<jeton>), SANS compte : l'accès est donné par le jeton du lien
// envoyé à l'entreprise (48 caractères hexadécimaux, 192 bits aléatoires,
// valable 30 jours).
//   GET  ?token=…                         → entreprise + état de ses documents (aucun fichier)
//   POST { token, action: 'prepare', kind, name, type, size } → URL de dépôt signée
//   POST { token, action: 'register', kind, path, name }      → lecture IA + enregistrement
// L'entreprise ne voit ni ne télécharge aucun fichier, et ne peut rien supprimer.

import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { adminClient } from '@/app/lib/supabaseClients'
import { DOC_KINDS, DOC_META, contactCompliance } from '@/app/lib/conformite'
import {
  isRequestToken, prepareUpload, registerDocument, loadContactDocs, notifyDeposit, todayParis, MIGRATION_MSG,
} from '@/app/lib/conformiteServer'

export const maxDuration = 60

const log = createLogger('conformite-public')
const checkRate = createRateLimiter({ limit: 30, windowMs: 60_000 })
const clientIp = (request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue'
const fail = (error, status = 400) => Response.json({ error }, { status })

async function findRequest(admin, token) {
  if (!isRequestToken(token)) return { error: 'Lien invalide.', status: 404 }
  const { data: req, error } = await admin.from('contact_doc_requests').select('*').eq('token', token).maybeSingle()
  if (error) return { error: /does not exist|schema cache/i.test(error.message || '') ? MIGRATION_MSG : 'Lien indisponible.', status: 503 }
  if (!req) return { error: 'Lien invalide.', status: 404 }
  if (new Date(req.expire_le).getTime() < Date.now()) return { error: 'Ce lien a expiré : demandez-en un nouveau à votre interlocuteur.', status: 410 }
  const { data: contact } = await admin.from('contacts').select('*').eq('id', req.contact_id).maybeSingle()
  if (!contact) return { error: 'Lien invalide.', status: 404 }
  return { req, contact }
}

// État affiché à l'entreprise : type, état, date de fin (aucun fichier, aucune donnée lue)
function publicState(contact, docs) {
  const comp = contactCompliance(docs, todayParis())
  return {
    entreprise: contact.societe || contact.nom,
    documents: DOC_KINDS.map(kind => ({
      kind, label: DOC_META[kind].long, aide: DOC_META[kind].aide,
      status: comp.kinds[kind].status, valideAu: comp.kinds[kind].valideAu,
    })),
  }
}

export async function GET(request) {
  if (!checkRate(clientIp(request))) return fail('Trop de demandes, réessayez dans une minute.', 429)
  const token = new URL(request.url).searchParams.get('token')
  try {
    const admin = adminClient()
    const found = await findRequest(admin, token)
    if (found.error) return fail(found.error, found.status)
    const { data: docs, error } = await loadContactDocs(admin, found.contact.id)
    if (error) return fail('Lecture impossible.', 500)
    await admin.from('contact_doc_requests').update({ derniere_visite: new Date().toISOString() }).eq('id', found.req.id)
    return Response.json({ ok: true, data: { ...publicState(found.contact, docs), expireLe: found.req.expire_le } })
  } catch (err) {
    log.error('exception GET', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}

export async function POST(request) {
  if (!checkRate(clientIp(request))) return fail('Trop de demandes, réessayez dans une minute.', 429)
  let body
  try { body = await request.json() } catch { return fail('Requête invalide') }
  try {
    const admin = adminClient()
    const found = await findRequest(admin, body?.token)
    if (found.error) return fail(found.error, found.status)
    const { contact } = found
    if (body.action === 'prepare') {
      const r = await prepareUpload(admin, { contactId: contact.id, kind: body.kind, name: body.name, type: body.type, size: body.size }, log)
      return r.error ? fail(r.error, r.status) : Response.json({ ok: true, data: r.data })
    }
    if (body.action === 'register') {
      const r = await registerDocument(admin, { contact, kind: body.kind, path: body.path, name: body.name, by: 'entreprise', log })
      if (r.error) return fail(r.error, r.status)
      await notifyDeposit(admin, { contact, kind: body.kind, doc: r.data }, log)
      const { data: docs } = await loadContactDocs(admin, contact.id)
      return Response.json({ ok: true, data: publicState(contact, docs || []) })
    }
    return fail('Action inconnue')
  } catch (err) {
    log.error('exception POST', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
