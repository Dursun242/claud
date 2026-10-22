// Fiche contact au format vCard 3.0 (.vcf), pour l'enregistrer dans les
// contacts du téléphone (iPhone : « Créer un contact »). Logique pure,
// utilisée par shareVCard.js. Tests : __tests__/vcard.test.js.

const COMPANY_TYPES = ['Artisan', 'Sous-traitant', 'Prestataire', 'Fournisseur', 'BET', 'Architecte']
const CIVILITE = /^(m\.?|mr\.?|mme\.?|mlle\.?|monsieur|madame|mademoiselle|me\.?|dr\.?)$/i

/** Échappement des valeurs vCard (antislash, virgule, point-virgule, retours à la ligne). */
export const esc = (v) => String(v ?? '').trim()
  .replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

const isCaps = (w) => /\p{L}/u.test(w) && w === w.toUpperCase() && w.replace(/[^\p{L}]/gu, '').length > 1

/**
 * Nom d'une personne → { prefix, family, given }. Le nom de famille est le
 * mot en majuscules (« M. DEBRIS Julien »), sinon le dernier mot.
 */
export function splitName(nom) {
  const words = String(nom || '').trim().split(/\s+/).filter(Boolean)
  const prefix = words.length > 1 && CIVILITE.test(words[0]) ? words.shift() : ''
  const caps = words.filter(isCaps)
  if (caps.length && caps.length < words.length) {
    return { prefix, family: caps.join(' '), given: words.filter(w => !isCaps(w)).join(' ') }
  }
  if (words.length < 2) return { prefix, family: words.join(' '), given: '' }
  return { prefix, family: words[words.length - 1], given: words.slice(0, -1).join(' ') }
}

/**
 * La fiche décrit une entreprise plutôt qu'une personne : type entreprise,
 * pas de raison sociale à part, pas de nom de famille en majuscules ni de
 * civilité (« Costa Plomberie », « Électricité Martin »).
 */
export function isCompanyCard(c = {}) {
  const nom = String(c.nom || '').trim()
  if (!COMPANY_TYPES.includes(c.type) || !nom) return false
  if (c.societe && c.societe.trim() && c.societe.trim() !== nom) return false
  const words = nom.split(/\s+/)
  return !CIVILITE.test(words[0]) && !words.some(isCaps)
}

/** Texte .vcf d'un contact de l'annuaire. */
export function contactVCard(c = {}) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  const nom = String(c.nom || '').trim() || String(c.societe || '').trim() || 'Contact'
  const company = isCompanyCard(c)
  const org = String(c.societe || '').trim() || (company ? nom : '')
  if (company) {
    lines.push('N:;;;;', `FN:${esc(nom)}`, 'X-ABSHOWAS:COMPANY')
  } else {
    const n = splitName(nom)
    lines.push(`N:${esc(n.family)};${esc(n.given)};;${esc(n.prefix)};`, `FN:${esc([n.given, n.family].filter(Boolean).join(' ') || nom)}`)
  }
  if (org) lines.push(`ORG:${esc(org)}`)
  if (c.fonction) lines.push(`TITLE:${esc(c.fonction)}`)
  if (c.tel) lines.push(`TEL;TYPE=CELL,VOICE:${esc(c.tel)}`)
  if (c.tel_fixe) lines.push(`TEL;TYPE=WORK,VOICE:${esc(c.tel_fixe)}`)
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(c.email)}`)
  if (c.email_travaux && String(c.email_travaux).trim().toLowerCase() !== String(c.email || '').trim().toLowerCase()) {
    lines.push(`item1.EMAIL;TYPE=INTERNET:${esc(c.email_travaux)}`, 'item1.X-ABLabel:Travaux')
  }
  if (c.adresse || c.code_postal || c.ville) {
    lines.push(`ADR;TYPE=WORK:;;${esc(c.adresse)};${esc(c.ville)};;${esc(c.code_postal)};France`)
  }
  if (c.site_web) {
    const url = String(c.site_web).trim()
    lines.push(`URL:${esc(/^https?:\/\//i.test(url) ? url : `https://${url}`)}`)
  }
  const note = [
    c.type && `${c.type}${c.specialite ? ` — ${c.specialite}` : ''}`,
    c.siret && `SIRET : ${c.siret}`,
    c.qualifications && `Qualifications : ${c.qualifications}`,
  ].filter(Boolean).join('\n')
  if (note) lines.push(`NOTE:${esc(note)}`)
  lines.push('END:VCARD')
  return `${lines.join('\r\n')}\r\n`
}

/** Nom du fichier .vcf (sans accents ni caractères spéciaux). */
export function vcardFileName(c = {}) {
  const base = String(c.nom || c.societe || 'contact').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `${base || 'contact'}.vcf`
}
