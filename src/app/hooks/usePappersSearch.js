'use client'

// ═══════════════════════════════════════════════════════════════
// usePappersSearch — recherche d'entreprises / dirigeants via Pappers
// et pré-remplissage d'un formulaire contact.
// ═══════════════════════════════════════════════════════════════
//
// Le hook encapsule :
//   - 4 variables d'état (pSearch, pLoading, pResults, pError)
//   - fetchPappers : appel authentifié à /api/pappers
//   - fillFromPappers : merge d'une entreprise dans le form parent
//   - searchPappers : recherche texte OU lookup SIRET direct
//   - importEntrepriseFromSearch / importDirigeantFromSearch : clics sur
//     les résultats de la recherche texte
//
// L'appelant fournit :
//   - setForm : setter du form contact (on fusionne sans jamais écraser
//               les champs déjà remplis par l'utilisateur, sauf pour
//               les champs "officiels" comme la dénomination/SIRET).
//
// Le hook expose aussi fetchPappers pour les usages externes (enrichissement
// depuis un SIRET extrait par photo par exemple).

import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { SB } from '../dashboards/shared'

export function usePappersSearch({ setForm } = {}) {
  const [pSearch, setPSearch] = useState('')
  const [pLoading, setPLoading] = useState(false)
  const [pResults, setPResults] = useState(null)
  const [pError, setPError] = useState('')

  const fetchPappers = useCallback(async (queryString) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(`/api/pappers?${queryString}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
  }, [])

  // Stratégie de pré-remplissage :
  //   1. On garde les champs déjà saisis par l'utilisateur (ne pas écraser).
  //   2. Si form.nom est vide, on essaie de le remplir avec le 1er
  //      dirigeant/représentant trouvé dans l'entreprise.
  //   3. entreprise.denomination → toujours dans form.societe.
  //   4. Si on a un dirigeant (via options.dirigeant ou via les
  //      representants de l'entreprise), on remplit form.fonction avec
  //      sa qualité (Gérant, Président, etc.) si elle est vide.
  const fillFromPappers = useCallback((entreprise, options = {}) => {
    if (!entreprise) return
    const siege = entreprise.siege || {}

    const representants = entreprise.representants
      || entreprise.dirigeants_actuels
      || entreprise.dirigeants
      || []
    const dirigeant = options.dirigeant || representants[0] || null

    const formatName = (d) => {
      if (!d) return ''
      const prenom = (d.prenom || '').trim()
      const nom = (d.nom || d.nom_usage || '').trim()
      return `${prenom} ${nom}`.trim()
    }
    const dirigeantName = formatName(dirigeant)

    setForm?.((f) => ({
      ...f,
      nom: (f.nom && f.nom.trim()) || dirigeantName || f.nom,
      societe: entreprise.denomination || entreprise.nom_entreprise || f.societe,
      fonction: (f.fonction && f.fonction.trim()) || dirigeant?.qualite || f.fonction,
      siret: entreprise.siret || siege.siret || f.siret,
      tva_intra: entreprise.num_tva_intracommunautaire || f.tva_intra,
      adresse: siege.adresse_ligne_1 || siege.adresse || f.adresse,
      code_postal: siege.code_postal || f.code_postal,
      ville: siege.ville || f.ville,
      tel: entreprise.telephone || f.tel,
      email: entreprise.email || f.email,
      site_web: entreprise.site_internet || f.site_web,
      specialite: entreprise.libelle_activite_principale || f.specialite,
    }))
    setPResults(null)
    setPSearch('')
    setPError('')
  }, [setForm])

  // Fetch complet d'une entreprise par son SIRET : utile quand un résultat
  // de recherche est léger (pas de representants) et qu'on veut le détail.
  const fetchFullEntreprise = useCallback(async (siret) => {
    if (!siret) return null
    try {
      const res = await fetchPappers(`siret=${encodeURIComponent(siret)}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [fetchPappers])

  const importEntrepriseFromSearch = useCallback(async (entrepriseLight) => {
    setPLoading(true)
    try {
      const siret = entrepriseLight.siret || entrepriseLight.siege?.siret
      const full = (siret && await fetchFullEntreprise(siret)) || entrepriseLight
      fillFromPappers(full)
    } finally {
      setPLoading(false)
    }
  }, [fetchFullEntreprise, fillFromPappers])

  const importDirigeantFromSearch = useCallback(async (dirigeantInfo, entrepriseLight) => {
    setPLoading(true)
    try {
      const siret = entrepriseLight.siret || entrepriseLight.siege?.siret
      const full = (siret && await fetchFullEntreprise(siret)) || entrepriseLight
      fillFromPappers(full, { dirigeant: dirigeantInfo })
    } finally {
      setPLoading(false)
    }
  }, [fetchFullEntreprise, fillFromPappers])

  const searchPappers = useCallback(async () => {
    const v = pSearch.trim()
    if (!v) return
    setPLoading(true)
    setPError('')
    setPResults(null)
    try {
      const isSiret = /^\d{14}$/.test(v.replace(/\s/g, ''))
      const cleanSiret = v.replace(/\s/g, '')
      const qs = isSiret ? `siret=${cleanSiret}` : `q=${encodeURIComponent(v)}`
      try {
        SB.log('search_pappers', 'contact', null,
          `Recherche Pappers — ${v}`,
          { query: v, type: isSiret ? 'siret' : 'text' })
      } catch (_) {}

      const res = await fetchPappers(qs)
      const json = await res.json()
      if (!res.ok) { setPError(json.error || 'Erreur Pappers'); return }
      if (isSiret) {
        fillFromPappers(json)
      } else {
        const companies = json.resultats || []
        const dirigeants = json.dirigeants || []
        if (companies.length === 0 && dirigeants.length === 0) {
          setPError('Aucune entreprise ni dirigeant trouvé.')
          return
        }
        setPResults({ companies, dirigeants })
      }
    } catch (e) {
      setPError('Erreur réseau : ' + e.message)
    } finally {
      setPLoading(false)
    }
  }, [pSearch, fetchPappers, fillFromPappers])

  return {
    pSearch,
    setPSearch,
    pLoading,
    pResults,
    pError,
    searchPappers,
    importEntrepriseFromSearch,
    importDirigeantFromSearch,
    // Exposé pour les usages externes au hook (ex : enrichissement SIRET
    // après extraction par Claude Vision).
    fetchPappers,
  }
}
