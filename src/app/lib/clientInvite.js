// Client invité par son adresse email (souvent Gmail) depuis la fiche
// chantier (api/clients/invite, migration 048). Logique pure, testée dans
// __tests__/clientInvite.test.js.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Adresse nettoyée (minuscules, sans espaces) ou '' si invalide. */
export function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase()
  return EMAIL_RE.test(e) ? e : ''
}

/** Prénom / nom du compte client d'après le champ « Client » du chantier, sinon l'adresse. */
export function namesFor(client, email) {
  const words = String(client || '').trim().replace(/^(m\.|mme|mr|monsieur|madame)\s+/i, '').split(/\s+/).filter(Boolean)
  if (words.length) return { prenom: words[0], nom: words.slice(1).join(' ') }
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim()
  return { prenom: local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Client', nom: '' }
}

/** Mail d'invitation du client. */
export function inviteMailText({ client = '', chantier = '', email = '', url = '', company = {} } = {}) {
  return [
    `Bonjour${client ? ` ${client}` : ''},`,
    `Vous pouvez désormais suivre l'avancement de votre chantier${chantier ? ` « ${chantier} »` : ''} en ligne : comptes rendus, planning, documents et photos.`,
    `Pour y accéder, ouvrez le lien ci-dessous et connectez-vous avec votre compte Google (${email}) :\n${url}`,
    `Cordialement,\n${company.nom || ''}`.trim(),
  ].join('\n\n')
}
