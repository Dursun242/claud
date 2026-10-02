// Route /api/devis/documents — pièces jointes des mails de devis.
//
// Réservée au staff (verifyStaff). Fichiers dans le bucket privé
// `attachments` (cf. lib/devisDocuments.js) :
//   POST { action: 'prepare', name, type, size, permanent } → URL de dépôt
//        signée : le navigateur dépose le fichier directement dans Storage
//        (pas de limite Vercel de 4,5 Mo ; 10 Mo par document)
//        permanent : document proposé à chaque envoi (Kbis, décennale…)
//        sinon     : fichier joint pour cet envoi seulement
//   POST multipart { file, permanent: '1' | '0' } → dépôt via la route (4 Mo)
//   POST { action: 'list' }         → documents permanents
//   POST { action: 'remove', path } → retire un document permanent

import crypto from 'node:crypto'
import { verifyStaff } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { adminClient } from '@/app/lib/supabaseClients'
import {
  DOCS_PREFIX, ENVOI_PREFIX, MAX_DOC_BYTES, MAX_MULTIPART_BYTES, safeFileName, docDisplayName,
  docType, formatError, storageName,
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

// Chemin de stockage (clé compatible Supabase, nom d'origine retrouvé par
// docDisplayName).
function storagePath(name, permanent) {
  const key = storageName(name)
  return permanent
    ? `${DOCS_PREFIX}${Date.now()}__${key}`
    : `${ENVOI_PREFIX}${crypto.randomUUID()}/${key}`
}

const tooBig = (max) => `Fichier trop volumineux (${Math.round(max / 1024 / 1024)} Mo maximum) : compresse le PDF ou scanne en qualité standard.`

async function prepare(admin, body) {
  const name = safeFileName(body.name)
  const type = docType(name, body.type)
  if (!type) return fail(formatError(name), 400)
  const size = Number(body.size) || 0
  if (size > MAX_DOC_BYTES) return fail(tooBig(MAX_DOC_BYTES), 400)
  const path = storagePath(name, body.permanent === true || body.permanent === '1')
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    log.error('url de dépôt', error?.message || 'sans jeton')
    return fail('Dépôt du fichier impossible : ' + (error?.message || 'réessaie'), 500)
  }
  return Response.json({ ok: true, data: { path, token: data.token, name, type, size } })
}

async function upload(admin, request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') return fail('Fichier manquant', 400)
  const name = safeFileName(file.name)
  const type = docType(name, file.type)
  if (!type) return fail(formatError(name), 400)
  if (file.size > MAX_MULTIPART_BYTES) return fail(tooBig(MAX_MULTIPART_BYTES), 400)
  const path = storagePath(name, form.get('permanent') === '1')
  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false })
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
    if (body.action === 'prepare') return await prepare(admin, body)
    if (body.action === 'remove') return await remove(admin, body.path)
    return fail('Action inconnue', 400)
  } catch (err) {
    log.error('exception', err?.message || err)
    return fail('Erreur serveur', 500)
  }
}
