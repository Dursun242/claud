// Enregistrer un contact de l'annuaire dans le téléphone, sans passer par
// le serveur : la fiche .vcf est préparée dans le navigateur (lib/vcard.js)
// puis confiée au menu de partage du téléphone (iPhone : « Contacts »,
// puis « Créer un contact »). Ordinateur, ou navigateur sans partage de
// fichiers : téléchargement du .vcf.
//
// Pas d'appel réseau avant navigator.share : l'iPhone n'ouvre le menu que
// pendant le geste de l'utilisateur. Dans l'app installée sur l'écran
// d'accueil, ouvrir la fiche par un lien donne un fichier ou une page
// blanche, d'où le partage.

import { contactVCard, vcardFileName } from './vcard'

/**
 * @returns {Promise<'shared'|'cancelled'|'downloaded'>}
 */
export async function shareContactCard(contact, { nav = typeof navigator !== 'undefined' ? navigator : null, doc = typeof document !== 'undefined' ? document : null } = {}) {
  const text = contactVCard(contact)
  const name = vcardFileName(contact)
  const file = typeof File === 'function' ? new File([text], name, { type: 'text/vcard' }) : null
  if (file && nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: contact?.nom || 'Contact' })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // NotAllowedError ou autre : on retombe sur le téléchargement
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard;charset=utf-8' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  doc.body.appendChild(a)
  a.click()
  doc.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
