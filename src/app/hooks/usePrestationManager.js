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
//   - Calcul délégué à lib/osRules (computeOsTotals) : mêmes montants que
//     le PDF et l'enregistrement. 0 % reste 0 % ; 20 % si le taux est vide.
//   - options.tvaNonApplicable : toutes les lignes à 0 % (art. 293 B du CGI).

import { useState, useMemo, useCallback } from 'react'
import { computeOsTotals } from '../lib/osRules'

const BLANK_PRESTATION = {
  description: '',
  unite: 'u',
  quantite: '',
  prix_unitaire: '',
  tva_taux: '20',
}

export function usePrestationManager(initial = [], { tvaNonApplicable = false } = {}) {
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
    const { ht, tva, ttc } = computeOsTotals(prestations, tvaNonApplicable)
    return { ht, tva, ttc }
  }, [prestations, tvaNonApplicable])

  return {
    prestations,
    setPrestations,
    addPrestation,
    removePrestation,
    updatePrestation,
    totals,
  }
}
