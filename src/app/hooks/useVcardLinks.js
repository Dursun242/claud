'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Liens « Enregistrer dans les contacts du téléphone » (/api/contacts/vcard).
// La clé signée (2 h) est demandée à l'avance, à l'ouverture de l'onglet :
// le bouton peut alors être un vrai lien ouvert dans Safari, seul moyen pour
// que l'iPhone affiche directement « Créer un contact » (une ouverture après
// un appel réseau est traitée comme un téléchargement de fichier).

const MARGIN_MS = 10 * 60 * 1000

export function useVcardLinks({ enabled = true } = {}) {
  const [key, setKey] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer = null
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch('/api/contacts/vcard', {
          method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled || !res.ok || !json.sig) return
        setKey({ exp: json.exp, sig: json.sig })
        timer = setTimeout(load, Math.max(60_000, json.exp * 1000 - Date.now() - MARGIN_MS))
      } catch { /* hors ligne : pas de lien, le bouton reste masqué */ }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [enabled])

  return useCallback((id) => {
    if (!key || !id || key.exp * 1000 - Date.now() < 60_000) return null
    return `/api/contacts/vcard?${new URLSearchParams({ id, exp: String(key.exp), sig: key.sig })}`
  }, [key])
}
