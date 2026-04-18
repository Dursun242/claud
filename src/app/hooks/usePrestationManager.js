'use client'

// ═══════════════════════════════════════════════════════════════
// usePrestationManager — gestion de la liste des prestations d'un OS.
// ═══════════════════════════════════════════════════════════════
//
// Pures opérations sur tableau + calcul mémoïsé des totaux HT/TVA/TTC.
// Utilisé dans le formulaire OS (OrdresServiceV).
//
// Signature :
//   const { prestations, setPrestations, addPrestation,
//           removePrestation, updatePrestation, totals }
//     = usePrestationManager(initialPrestations)
//
// Notes :
//   - Les montants sont parseFloat au calcul — les prestations restent
//     des strings (inputs controlled).
//   - TVA par défaut 20 % si champ vide ou invalide.

import { useState, useMemo, useCallback } from 'react'

const BLANK_PRESTATION = {
  description: '',
  unite: 'u',
  quantite: '',
  prix_unitaire: '',
  tva_taux: '20',
}

export function usePrestationManager(initial = []) {
  const [prestations, setPrestations] = useState(initial)

  const addPrestation = useCallback(() => {
    setPrestations((p) => [...p, { ...BLANK_PRESTATION }])
  }, [])

  const removePrestation = useCallback((i) => {
    setPrestations((p) => p.filter((_, j) => j !== i))
  }, [])

  const updatePrestation = useCallback((i, field, val) => {
    setPrestations((p) => p.map((x, j) => (j === i ? { ...x, [field]: val } : x)))
  }, [])

  const totals = useMemo(() => {
    let ht = 0
    let tva = 0
    prestations.forEach((p) => {
      const line = (parseFloat(p.quantite) || 0) * (parseFloat(p.prix_unitaire) || 0)
      ht += line
      tva += (line * (parseFloat(p.tva_taux) || 20)) / 100
    })
    return { ht, tva, ttc: ht + tva }
  }, [prestations])

  return {
    prestations,
    setPrestations,
    addPrestation,
    removePrestation,
    updatePrestation,
    totals,
  }
}
