'use client'

/**
 * Repère emoji posé dans une petite tuile arrondie (façon icônes des
 * Réglages iOS) : même taille partout, décoratif pour les lecteurs d'écran
 * (le titre ou la ligne porte le sens).
 *
 * @param e      l'emoji (voir lib/emoji.js)
 * @param size   côté de la tuile en px (28 par défaut, 24 dans les lignes)
 * @param tile   fond de la tuile (gris iOS par défaut ; blanc sur un fond gris)
 */
export default function Emoji({ e, size = 28, tile = '#F2F2F7' }) {
  if (!e) return null
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, minWidth: size, borderRadius: Math.round(size * 0.28),
        background: tile, fontSize: Math.round(size * 0.57), lineHeight: 1,
        flexShrink: 0,
      }}
    >{e}</span>
  )
}
