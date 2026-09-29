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
// Vercel limite le corps d'une requête à 4,5 Mo
export const MAX_DOC_BYTES = 4 * 1024 * 1024
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
  const base = String(path || '').split('/').pop() || ''
  return base.replace(/^\d+__/, '') || 'document'
}
