// Route /api/devis/documents — pièces jointes des mails de devis.
//
// Réservée au staff (verifyStaff). Fichiers dans le bucket privé
// `attachments` (cf. lib/devisDocuments.js) :
//   POST multipart { file, permanent: '1' | '0' } → dépôt du fichier
//        permanent : document proposé à chaque envoi (Kbis, décennale…)
//        sinon     : fichier joint pour cet envoi seulement
//   POST { action: 'list' }         → documents permanents
//   POST { action: 'remove', path } → retire un document permanent

import crypto from 'node:crypto'
import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import {
  DOCS_PREFIX, ENVOI_PREFIX, MAX_DOC_BYTES, DOC_TYPES, safeFileName, docDisplayName,
} from '@/app/lib/devisDocuments'

export const maxDuration = 30

const log = createLogger('devis-documents')
const BUCKET = 'attachments'
const fail = (error, status) => Response.json({ error }, { status })

async function list(admin) {
  const { data, error } = await admin.storage.from(BUCKET).list(DOCS_PREFIX.slice(0, -1), {
    limit: 100, sortBy: { column: 'name', order: 'asc' },
  })
  if (error) return fail('Lecture des documents impossible : ' + error.message, 500)
  const docs = (data || [])
    .filter(f => f?.name && f.id !== null && f.name !== '.emptyFolderPlaceholder')
    .map(f => ({ path: `${DOCS_PREFIX}${f.name}`, name: docDisplayName(f.name), size: f.metadata?.size ?? null }))
  return Response.json({ ok: true, data: { docs } })
}

async function upload(admin, request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') return fail('Fichier manquant', 400)
  if (!DOC_TYPES[file.type]) return fail('Format non accepté : PDF, image (JPG, PNG), Word ou Excel.', 400)
  if (file.size > MAX_DOC_BYTES) return fail('Fichier trop volumineux (4 Mo maximum).', 400)
  const permanent = form.get('permanent') === '1'
  const name = safeFileName(file.name)
  const path = permanent
    ? `${DOCS_PREFIX}${Date.now()}__${name}`
    : `${ENVOI_PREFIX}${crypto.randomUUID()}/${name}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false })
  if (error) return fail('Dépôt du fichier impossible : ' + error.message, 500)
  return Response.json({ ok: true, data: { path, name, size: buf.length } })
}

async function remove(admin, path) {
  const p = String(path || '')
  if (!p.startsWith(DOCS_PREFIX) || p.includes('..') || p.slice(DOCS_PREFIX.length).includes('/')) return fail('Document invalide', 400)
  const { error } = await admin.storage.from(BUCKET).remove([p])
  if (error) return fail('Suppression impossible : ' + error.message, 500)
  return Response.json({ ok: true })
}

export async function POST(request) {
  try {
    const { user, status } = await verifyStaff(request)
    if (!user) return fail(status === 403 ? 'Réservé à l’équipe' : 'Non autorisé', status)
    const admin = adminClient()
    if (String(request.headers.get('content-type') || '').startsWith('multipart/form-data')) {
      return await upload(admin, request)
    }
    const body = await request.json().catch(() => ({}))
    if (body.action === 'list') return await list(admin)
    if (body.action === 'remove') return await remove(admin, body.path)
    return fail('Action inconnue', 400)
  } catch (err) {
    log.error('exception', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
