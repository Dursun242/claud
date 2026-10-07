'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Fiche ouverte en arrivant d'une autre page (tableau de bord → affaire du
 * CRM, tâche…) : la fermer ramène à la page d'origine.
 *
 * - openId : identifiant de la fiche affichée (null si aucune)
 * - back   : { label, go } transmis par AdminDashboard (null sans origine)
 *
 * markFromNav(id) au moment où la page ouvre la fiche demandée ; ouvrir une
 * autre fiche à la main annule le retour.
 */
export function useNavReturn(openId, back) {
  const [fromNav, setFromNav] = useState(null)
  useEffect(() => {
    if (fromNav != null && openId !== fromNav) setFromNav(null)
  }, [openId, fromNav])
  const active = !!back && fromNav != null && openId === fromNav
  // À appeler après avoir fermé la fiche
  const returnIfFromNav = useCallback(() => { if (active) back.go() }, [active, back])
  return { markFromNav: setFromNav, returnIfFromNav }
}
