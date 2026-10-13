// Artisan d'un ordre de service ↔ contact de l'annuaire.
//
// L'OS ne garde que les coordonnées de l'artisan (artisan_nom, email,
// SIRET…), pas l'id du contact. On retrouve le contact par SIRET, puis par
// email, puis par nom ou raison sociale (sans tenir compte des majuscules,
// accents ni espaces en trop). Sert à rattacher l'artisan aux intervenants
// du chantier à l'enregistrement de l'OS (SB.upsertOS) et à la liste des
// intervenants de la fiche chantier. Logique pure, testée dans
// __tests__/osArtisan.test.js.

const digits = (v) => String(v || '').replace(/\D/g, '')
const mail = (v) => String(v || '').trim().toLowerCase()
export const normName = (v) => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Contact correspondant à l'artisan de l'OS, ou null. */
export function findArtisanContact(os = {}, contacts = []) {
  const siret = digits(os.artisan_siret)
  if (siret.length >= 9) {
    const c = contacts.find(x => digits(x.siret) && digits(x.siret) === siret)
    if (c) return c
  }
  const email = mail(os.artisan_email)
  if (email.includes('@')) {
    const c = contacts.find(x => mail(x.email) === email || mail(x.email_travaux) === email)
    if (c) return c
  }
  const nom = normName(os.artisan_nom)
  if (!nom) return null
  return contacts.find(x => normName(x.nom) === nom)
    || contacts.find(x => normName(x.societe) === nom)
    || null
}
