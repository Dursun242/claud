// Ouvre un lien obtenu après un appel réseau dans un nouvel onglet.
// Safari (iPhone) bloque window.open appelé après un « await » : l'onglet
// est donc ouvert tout de suite, pendant le clic, puis reçoit l'adresse.
// Si l'ouverture est refusée (bloqueur), la page actuelle va au lien.

/**
 * @param {() => Promise<string>} getUrl  appel qui renvoie l'adresse
 * @returns {Promise<string>}
 */
export async function openLater(getUrl) {
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const url = await getUrl()
    if (win && !win.closed) {
      try { win.opener = null } catch { /* sans effet */ }
      win.location.href = url
    } else {
      window.location.assign(url)
    }
    return url
  } catch (err) {
    try { win?.close() } catch { /* déjà fermé */ }
    throw err
  }
}
