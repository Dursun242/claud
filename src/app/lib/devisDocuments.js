/**
 * Pièces jointes des mails de devis (bucket privé `attachments`) :
 *   devis-documents/<horodatage>__<nom>  → documents permanents (Kbis,
 *                                          attestation décennale…), proposés
 *                                          cochés à chaque envoi
 *   devis-envoi/<id>/<nom>               → fichier joint pour un seul envoi
 * Logique pure, partagée par /api/devis/documents et /api/devis/send.
 */

export const DOCS_PREFIX = 'devis-documents/'
export const ENVOI_PREFIX = 'devis-envoi/'
// Dépôt direct navigateur → Supabase Storage (URL signée) : pas de limite
// Vercel. 10 Mo par document (scans de Kbis / attestations).
export const MAX_DOC_BYTES = 10 * 1024 * 1024
// Ancien dépôt via la route (multipart) : Vercel limite le corps à 4,5 Mo
export const MAX_MULTIPART_BYTES = 4 * 1024 * 1024
// Total des pièces jointes d'un mail (hors PDF du devis)
export const MAX_ATTACH_TOTAL = 15 * 1024 * 1024
export const MAX_ATTACH_COUNT = 10

export const DOC_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const EXT_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * Type MIME accepté pour un fichier : celui annoncé par le navigateur, sinon
 * déduit de l'extension (certains navigateurs / téléphones envoient un type
 * vide ou « application/octet-stream »). null si refusé.
 */
export function docType(name, type) {
  if (DOC_TYPES[type]) return type
  const ext = String(name || '').toLowerCase().split('.').pop()
  return EXT_TYPES[ext] || null
}

/** Message d'erreur pour un format refusé (cas fréquent : photo HEIC d'iPhone). */
export function formatError(name) {
  return /\.hei[cf]$/i.test(String(name || ''))
    ? 'Photo iPhone (HEIC) non acceptée : exporte-la en JPG ou PDF, puis réessaie.'
    : 'Format non accepté : PDF, image (JPG, PNG), Word ou Excel.'
}

// Supabase Storage refuse les clés contenant des accents ou certains
// caractères (« Invalid key ») : un nom qui n'est pas « sûr » est encodé
// (base64url, préfixe « u- ») et décodé à l'affichage.
const KEY_SAFE = /^[A-Za-z0-9_\-.!*'() &$@=;:+,?]+$/

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

/** Segment de clé Storage pour un nom de fichier (lisible si possible). */
export function storageName(name) {
  return KEY_SAFE.test(name) ? name : `u-${toBase64Url(name)}`
}

/** Nom de fichier sûr (accents conservés, pas de chemin ni de caractère spécial). */
export function safeFileName(name) {
  const clean = String(name || '').split(/[\\/]/).pop()
    .normalize('NFC').replace(/[^\p{L}\p{N}.\- _()]+/gu, '_').replace(/\s+/g, ' ').trim()
  return clean.slice(-100) || 'document'
}

/** Chemin autorisé comme pièce jointe (préfixes dédiés, pas de remontée). */
export function isDocPath(path) {
  const p = String(path || '')
  return (p.startsWith(DOCS_PREFIX) || p.startsWith(ENVOI_PREFIX)) && !p.includes('..') && p.length < 300
}

/** Nom affiché / nom de la pièce jointe à partir du chemin de stockage. */
export function docDisplayName(path) {
  const base = (String(path || '').split('/').pop() || '').replace(/^\d+__/, '')
  if (base.startsWith('u-')) {
    try { return fromBase64Url(base.slice(2)) || 'document' } catch { /* nom brut ci-dessous */ }
  }
  return base || 'document'
}
