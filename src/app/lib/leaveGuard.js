// Protection contre la fermeture accidentelle d'un travail en cours
// (fenêtre de saisie, éditeur de compte rendu…). Tant qu'au moins une
// fenêtre est ouverte :
//  - le bouton / geste « retour » du téléphone ne quitte plus l'application :
//    la fenêtre reste ouverte et un message invite à la fermer avec ✕ ;
//  - fermer l'onglet ou recharger la page demande confirmation
//    (« Quitter le site ? » du navigateur) ;
//  - le « tirer pour actualiser » du téléphone est désactivé.
//
// Compteur global : plusieurs fenêtres peuvent être ouvertes en même temps
// (ex. un contact créé depuis un formulaire d'OS). Sans `window`, rien ne se
// passe (rendu serveur, tests).

export const BACK_BLOCKED_EVENT = 'idm-back-blocked'
const GUARD_STATE = 'idmGuard'

let count = 0
let prevOverscroll = null

const hasWindow = () => typeof window !== 'undefined' && typeof window.history !== 'undefined'
const isGuardEntry = (state) => !!(state && state[GUARD_STATE])

function onBeforeUnload(e) {
  e.preventDefault()
  // Ancienne API encore requise par certains navigateurs
  e.returnValue = ''
  return ''
}

function onPopState(e) {
  if (count === 0) return
  // Le retour a consommé notre entrée d'historique : on la remet pour que
  // la fenêtre reste ouverte et qu'un nouveau retour soit encore intercepté.
  if (!isGuardEntry(e.state)) {
    try { window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '') } catch { /* */ }
  }
  try { window.dispatchEvent(new CustomEvent(BACK_BLOCKED_EVENT)) } catch { /* */ }
}

function activate() {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('popstate', onPopState)
  // Une seule entrée « garde » dans l'historique, réutilisée d'une
  // fenêtre à l'autre (pas d'accumulation).
  if (!isGuardEntry(window.history.state)) {
    try { window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '') } catch { /* */ }
  }
  const root = document.documentElement
  prevOverscroll = root.style.overscrollBehaviorY
  root.style.overscrollBehaviorY = 'none'
}

function deactivate() {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('popstate', onPopState)
  document.documentElement.style.overscrollBehaviorY = prevOverscroll || ''
  prevOverscroll = null
}

/** Active la protection ; renvoie la fonction qui la libère (une seule fois). */
export function holdLeaveGuard() {
  if (!hasWindow()) return () => {}
  count += 1
  if (count === 1) activate()
  let released = false
  return () => {
    if (released) return
    released = true
    count = Math.max(0, count - 1)
    if (count === 0) deactivate()
  }
}

/** Nombre de protections actives (tests). */
export const activeLeaveGuards = () => count
