// Documents des entreprises — accès serveur (service role) : dépôt par URL
// signée, lecture par l'IA, enregistrement, demandes envoyées aux
// entreprises. Utilisé par /api/conformite (équipe), /api/conformite/public
// (entreprise, par jeton) et /api/cron/conformite (relances).

import crypto from 'node:crypto'
import { generate, stripJsonFence } from './ai'
import { DOC_KINDS, DOC_META, computeValidUntil, identityAnomalies, contactCompliance, requestMailText, isIsoDate, normIban } from './conformite'
import { validateIban } from './validators'
import { DOC_READ_SCHEMA, DOC_READ_SYSTEM, docReadPrompt, cleanDocRead } from './conformiteAi'
import { safeFileName, storageName } from './devisDocuments'
import { smtpConfig, sendMail } from './mailer'
import { COMPANY } from './company'

export const BUCKET = 'attachments'
export const CONF_PREFIX = 'conformite/'
export const MAX_CONF_BYTES = 10 * 1024 * 1024
export const REQUEST_DAYS = 30
// Au-delà, le fichier est gardé mais pas envoyé à l'IA (dates à saisir)
const MAX_AI_IMAGE = 5 * 1024 * 1024
const MAX_AI_PDF = 20 * 1024 * 1024

const EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const OK_TYPES = new Set(Object.values(EXT_TYPES))

/** Type accepté (PDF ou photo), d'après le type annoncé ou l'extension. */
export function confType(name, type) {
  if (OK_TYPES.has(type)) return type
  const ext = String(name || '').toLowerCase().split('.').pop()
  return EXT_TYPES[ext] || null
}

export function confFormatError(name) {
  return /\.(heic|heif)$/i.test(String(name || ''))
    ? 'Photo iPhone (HEIC) non acceptée : exportez-la en JPG ou PDF, puis réessayez.'
    : 'Format non accepté : PDF ou photo (JPG, PNG).'
}

export const isKind = (k) => DOC_KINDS.includes(k)
export const newRequestToken = () => crypto.randomBytes(24).toString('hex')
export const isRequestToken = (t) => typeof t === 'string' && /^[a-f0-9]{48}$/.test(t)

export function confPath(contactId, kind, name) {
  return `${CONF_PREFIX}${contactId}/${kind}/${Date.now()}__${storageName(safeFileName(name))}`
}
export const pathBelongs = (path, contactId, kind) => typeof path === 'string'
  && path.startsWith(`${CONF_PREFIX}${contactId}/${kind}/`) && !path.includes('..') && !path.slice(CONF_PREFIX.length).includes('//')

const fail = (error, status = 400) => ({ error, status })
const missingTable = (err) => err && (err.code === '42P01' || /does not exist|schema cache/i.test(err.message || ''))
export const MIGRATION_MSG = 'Documents des entreprises non activés : appliquer la migration 036 dans Supabase.'
export const RIB_MIGRATION_MSG = 'RIB non activé : appliquer la migration 037 dans Supabase.'

/** URL de dépôt signée (le navigateur envoie le fichier directement au stockage). */
export async function prepareUpload(admin, { contactId, kind, name, type, size }, log) {
  if (!isKind(kind)) return fail('Type de document inconnu.')
  const fileName = safeFileName(name)
  const mediaType = confType(fileName, type)
  if (!mediaType) return fail(confFormatError(fileName))
  if (Number(size) > MAX_CONF_BYTES) return fail('Fichier trop volumineux (10 Mo maximum) : scannez en qualité standard ou prenez une photo.')
  const path = confPath(contactId, kind, fileName)
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    log?.error('URL de dépôt', error?.message || 'jeton absent')
    return fail('Dépôt impossible pour le moment, réessayez.', 500)
  }
  return { data: { path, token: data.token, name: fileName, type: mediaType } }
}

/** Lecture du document par l'IA. Ne lève jamais : { fields } ou { failed }. */
export async function readWithAi({ buffer, mediaType, kind, contact, log }) {
  const isPdf = mediaType === 'application/pdf'
  if (buffer.length > (isPdf ? MAX_AI_PDF : MAX_AI_IMAGE)) return { failed: 'Fichier trop lourd pour la lecture automatique.' }
  const ai = await generate({
    system: DOC_READ_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: isPdf ? 'document' : 'image', mediaType, base64: buffer.toString('base64') },
        { type: 'text', text: docReadPrompt(kind, contact) },
      ],
    }],
    json: DOC_READ_SCHEMA,
    maxTokens: 900,
    timeoutMs: 40_000,
    maxRetries: 0,
    log,
  })
  if (!ai.ok) return { failed: ai.message || 'Lecture automatique indisponible.' }
  try {
    return { fields: cleanDocRead(JSON.parse(stripJsonFence(ai.text)), kind) }
  } catch {
    return { failed: 'Réponse de la lecture automatique illisible.' }
  }
}

/**
 * Enregistre un document déposé : lecture IA, contrôles, ligne en base.
 * Décennale : met aussi à jour « Validité assurance » de la fiche.
 */
export async function registerDocument(admin, { contact, kind, path, name, by = 'equipe', log }) {
  if (!isKind(kind)) return fail('Type de document inconnu.')
  if (!pathBelongs(path, contact.id, kind)) return fail('Fichier invalide.')
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
  if (dlErr || !blob) return fail('Fichier introuvable : le dépôt n’est pas terminé, réessayez.')
  const fileName = safeFileName(name || path.split('__').pop())
  const mediaType = confType(fileName, blob.type) || 'application/pdf'
  const buffer = Buffer.from(await blob.arrayBuffer())

  const read = await readWithAi({ buffer, mediaType, kind, contact, log })
  const fields = read.fields || { anomalies: [] }
  const row = {
    contact_id: contact.id, kind, file_path: path, file_name: fileName, depose_par: by,
    lecture: read.fields ? 'auto' : 'echec',
    raison_sociale: fields.raison_sociale ?? null,
    siret_lu: fields.siret_lu ?? null,
    date_document: fields.date_document ?? null,
    valide_du: fields.valide_du ?? null,
    assureur: fields.assureur ?? null,
    numero_police: fields.numero_police ?? null,
    activites: fields.activites ?? null,
    code_securite: fields.code_securite ?? null,
    anomalies: read.fields
      ? [...fields.anomalies, ...identityAnomalies(fields, contact)]
      : [`Lecture automatique impossible (${read.failed}) : saisissez les dates à la main.`],
  }
  row.valide_au = computeValidUntil(kind, { date_document: row.date_document, valide_au: fields.valide_au })
  // Colonnes du RIB (migration 037) : seulement pour un RIB
  if (kind === 'rib') { row.iban = fields.iban ?? null; row.bic = fields.bic ?? null }

  const { data, error } = await admin.from('contact_documents').insert(row).select().single()
  if (error) {
    if (missingTable(error)) return fail(MIGRATION_MSG, 503)
    if (kind === 'rib' && (error.code === '23514' || error.code === '42703' || /iban|kind_check/i.test(error.message || ''))) {
      return fail(RIB_MIGRATION_MSG, 503)
    }
    log?.error('enregistrement document', error.message)
    return fail('Enregistrement impossible : ' + error.message, 500)
  }
  // RIB : l'IBAN rejoint la fiche si elle n'en a pas (jamais remplacé sans vérification)
  if (kind === 'rib' && data.iban && !contact.iban && validateIban(data.iban).valid) {
    const { error: upErr } = await admin.from('contacts').update({ iban: data.iban }).eq('id', contact.id)
    if (upErr) log?.warn('mise à jour IBAN de la fiche', upErr.message)
  }
  if (kind === 'decennale' && data.valide_au) {
    const patch = { assurance_validite: data.valide_au }
    const police = [data.assureur, data.numero_police].filter(Boolean).join(' – ')
    if (police) patch.assurance_decennale = police
    const { error: upErr } = await admin.from('contacts').update(patch).eq('id', contact.id)
    if (upErr) log?.warn('mise à jour assurance de la fiche', upErr.message)
  }
  return { data }
}

/** Correction à la main (dates) ; `verifie` efface les anomalies. */
export async function updateDocument(admin, { id, date_document, valide_au, verifie }, log) {
  const { data: doc, error } = await admin.from('contact_documents').select('*').eq('id', id).maybeSingle()
  if (error && missingTable(error)) return fail(MIGRATION_MSG, 503)
  if (!doc) return fail('Document introuvable.', 404)
  const dd = date_document === undefined ? doc.date_document : (isIsoDate(date_document) ? date_document : null)
  const fin = valide_au === undefined ? null : (isIsoDate(valide_au) ? valide_au : null)
  const patch = {
    date_document: dd,
    // Date de fin saisie : prise telle quelle ; sinon calculée depuis la date du document
    valide_au: fin || computeValidUntil(doc.kind, { date_document: dd, valide_au: doc.kind === 'decennale' ? doc.valide_au : null }),
    lecture: 'manuelle',
    updated_at: new Date().toISOString(),
  }
  if (verifie) patch.anomalies = []
  const { data, error: upErr } = await admin.from('contact_documents').update(patch).eq('id', id).select().single()
  if (upErr) { log?.error('correction document', upErr.message); return fail('Enregistrement impossible.', 500) }
  if (data.kind === 'decennale' && data.valide_au) {
    await admin.from('contacts').update({ assurance_validite: data.valide_au }).eq('id', data.contact_id)
  }
  // RIB vérifié par l'équipe (appel à l'entreprise) : son IBAN devient celui de la fiche
  if (data.kind === 'rib' && verifie && data.iban && validateIban(data.iban).valid) {
    await admin.from('contacts').update({ iban: normIban(data.iban) }).eq('id', data.contact_id)
  }
  return { data }
}

export async function deleteDocument(admin, id, log) {
  const { data: doc } = await admin.from('contact_documents').select('id, file_path').eq('id', id).maybeSingle()
  if (!doc) return fail('Document introuvable.', 404)
  const { error } = await admin.from('contact_documents').delete().eq('id', id)
  if (error) return fail('Suppression impossible : ' + error.message, 500)
  const { error: rmErr } = await admin.storage.from(BUCKET).remove([doc.file_path])
  if (rmErr) log?.warn('suppression fichier', rmErr.message)
  return { data: { id } }
}

export async function documentUrl(admin, id) {
  const { data: doc } = await admin.from('contact_documents').select('file_path').eq('id', id).maybeSingle()
  if (!doc) return fail('Document introuvable.', 404)
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(doc.file_path, 300)
  if (error || !data?.signedUrl) return fail('Lien du fichier indisponible.', 500)
  return { data: { url: data.signedUrl } }
}

export async function loadContactDocs(admin, contactId) {
  const { data, error } = await admin.from('contact_documents').select('*').eq('contact_id', contactId)
  if (error) return { error }
  return { data: data || [] }
}

export const todayParis = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)
export const depositLink = (appUrl, token) => `${String(appUrl || '').replace(/\/$/, '')}/deposer/${token}`

/** Demande en cours (non expirée, encore valable au moins 3 jours). */
export async function currentRequest(admin, contactId) {
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const { data } = await admin.from('contact_doc_requests').select('*')
    .eq('contact_id', contactId).gt('expire_le', soon)
    .order('created_at', { ascending: false }).limit(1)
  return data?.[0] || null
}

/**
 * Envoie (ou renvoie) à l'entreprise le lien de dépôt. Sans SMTP, la
 * demande est créée et le lien est renvoyé pour être copié.
 * @returns {{ data: { link, sent, email, expireLe } } | { error, status }}
 */
export async function sendRequest(admin, { contact, email, auto = false, appUrl, log }) {
  const to = String(email || contact.email || '').trim()
  if (to && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return fail('Adresse email invalide.')
  const { data: docs, error: docsErr } = await loadContactDocs(admin, contact.id)
  if (docsErr) return missingTable(docsErr) ? fail(MIGRATION_MSG, 503) : fail('Lecture des documents impossible.', 500)
  const compliance = contactCompliance(docs, todayParis())

  let req = await currentRequest(admin, contact.id)
  if (!req) {
    const expire = new Date(Date.now() + REQUEST_DAYS * 86_400_000).toISOString()
    const { data, error } = await admin.from('contact_doc_requests').insert({
      contact_id: contact.id, token: newRequestToken(), email: to || null, auto, envois: 0, expire_le: expire,
    }).select().single()
    if (error) return missingTable(error) ? fail(MIGRATION_MSG, 503) : fail('Création du lien impossible : ' + error.message, 500)
    req = data
  }
  const link = depositLink(appUrl, req.token)
  const cfg = smtpConfig()
  let sent = false
  if (cfg && to) {
    const { subject, text } = requestMailText({
      contact, compliance, link, expireLe: req.expire_le, company: COMPANY, relance: auto && (req.envois || 0) > 0,
    })
    try {
      await sendMail(cfg, { to, replyTo: cfg.notify, subject, text })
      sent = true
    } catch (e) {
      log?.warn('envoi de la demande de documents', `${e?.code || ''} ${e?.message || e}`)
      if (!auto) return fail('Envoi du mail impossible : vérifiez l’adresse ou la configuration SMTP.', 502)
    }
  }
  if (sent) {
    await admin.from('contact_doc_requests').update({
      envois: (req.envois || 0) + 1, dernier_envoi: new Date().toISOString(), email: to, auto,
    }).eq('id', req.id)
  }
  return { data: { link, sent, email: to || null, expireLe: req.expire_le } }
}

/** Prévient l'équipe d'un dépôt fait par l'entreprise (cloche + mail). */
export async function notifyDeposit(admin, { contact, kind, doc }, log) {
  const title = `📄 ${contact.societe || contact.nom} a déposé : ${DOC_META[kind]?.long || kind}`
  const body = doc?.anomalies?.length ? `À vérifier : ${doc.anomalies[0]}` : (doc?.valide_au ? `Valable jusqu’au ${doc.valide_au.split('-').reverse().join('/')}` : '')
  try {
    const { data: staff } = await admin.from('authorized_users').select('email, role, actif')
    const emails = [...new Set((staff || [])
      .filter(u => u.actif === true && ['admin', 'salarie', 'salarié'].includes(u.role) && u.email)
      .map(u => String(u.email).trim().toLowerCase()))]
    if (emails.length) {
      const { error } = await admin.from('notifications').insert(emails.map(recipient_email => ({
        recipient_email, actor_email: null, kind: 'create', entity_type: 'contact', entity_id: contact.id,
        chantier_id: null, title, body, target_tab: 'contacts',
      })))
      if (error) log?.warn('notification dépôt', error.message)
    }
  } catch (e) { log?.warn('notification dépôt', e?.message || e) }
}
