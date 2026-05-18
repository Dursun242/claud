/**
 * Motion tokens — durées et easings centralisés.
 *
 * Avant cette unification, l'app mélangeait sept durées (.12s, .15s, .2s,
 * .22s, .25s, .3s, .4s) et trois easings (ease, ease-out, cubic-bezier
 * maison). Le cerveau perçoit le rythme cassé même sans l'analyser :
 * d'où la sensation "ça n'est pas fluide" rapportée par les utilisateurs.
 *
 * Valeurs exposées aussi en variables CSS dans styles/global.css
 * (--motion-fast / --motion-base / --motion-slow / --ease-standard /
 * --ease-emphasized) pour les feuilles de style. Les modules JS qui
 * écrivent du `style` inline importent les constantes ci-dessous.
 *
 * Toutes les animations respectent `prefers-reduced-motion: reduce`
 * (cf. global.css), pas la peine de tester côté JS.
 */

export const DURATION = {
  fast: 120,    // micro-interactions : hover, focus, color swap
  base: 180,    // transitions standards : open modal, expand, slide
  slow: 280,    // transitions amples : page enter, dashboard mount
}

export const EASING = {
  standard: 'cubic-bezier(.4, 0, .2, 1)',     // ease-out canonique (Material)
  emphasized: 'cubic-bezier(.2, 0, 0, 1.2)',  // léger rebond pour les apparitions
  linear: 'linear',                            // spinners uniquement
}

const ms = (n) => `${n}ms`

// Compositions prêtes à l'emploi pour les inline styles courants.
// Exemple : style={{ transition: TRANSITION.base }}
export const TRANSITION = {
  fast: `all ${ms(DURATION.fast)} ${EASING.standard}`,
  base: `all ${ms(DURATION.base)} ${EASING.standard}`,
  slow: `all ${ms(DURATION.slow)} ${EASING.standard}`,
}

// Animations nommées — les keyframes sont définies dans global.css
// On exporte juste les "shortcuts" pour la prop `animation` inline.
export const ANIMATION = {
  fadeIn: `fadeIn ${ms(DURATION.base)} ${EASING.standard}`,
  fadeInFast: `fadeIn ${ms(DURATION.fast)} ${EASING.standard}`,
  fadeInUp: `fadeInUp ${ms(DURATION.slow)} ${EASING.emphasized}`,
  popIn: `popIn ${ms(DURATION.base)} ${EASING.emphasized}`,
  toastIn: `toastIn ${ms(DURATION.slow)} ${EASING.emphasized}`,
  spin: `spin 800ms ${EASING.linear} infinite`,
  spinSlow: `spin 1s ${EASING.linear} infinite`,
  shimmer: `skeletonShimmer 1.5s ${EASING.linear} infinite`,
}
