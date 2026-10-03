'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { FF, sel } from '../../dashboards/shared'

const HINT = "Le client ne voit le chantier que s'il est rattaché à son compte."

const accountLabel = (a) => {
  const name = [a.prenom, a.nom].filter(Boolean).join(' ').trim()
  return name ? `${name} — ${a.email}` : a.email
}

// Compte client rattaché au chantier (chantiers.client_user_id), côté équipe.
// Liste chargée au montage (= ouverture du formulaire) via la RPC
// client_accounts. '' ↔ null = rattachement automatique d'après le nom.
export default function ClientAccountField({ value, onChange }) {
  const [accounts, setAccounts] = useState(null)
  const [failed, setFailed] = useState(false)
  // Valeur à l'ouverture : reste proposée même absente de la liste (compte
  // désactivé), pour ne pas la perdre silencieusement.
  const [initial] = useState(value || null)

  useEffect(() => {
    let alive = true
    supabase.rpc('client_accounts').then(
      ({ data, error }) => {
        if (!alive) return
        if (error) setFailed(true)
        else setAccounts(data || [])
      },
      () => { if (alive) setFailed(true) },
    )
    return () => { alive = false }
  }, [])

  if (failed) {
    return (
      <FF label="Compte client (accès au suivi)">
        <div style={{fontSize:12,color:"#64748B"}}>
          Liste des comptes indisponible : rattachement automatique d&apos;après le nom du client.
        </div>
      </FF>
    )
  }

  if (!accounts) {
    return (
      <FF label="Compte client (accès au suivi)" hint={HINT}>
        <select style={sel} disabled><option>Chargement…</option></select>
      </FF>
    )
  }

  const showInitial = initial && !accounts.some(a => a.user_id === initial)
  return (
    <FF label="Compte client (accès au suivi)" hint={HINT}>
      <select style={sel} value={value || ""}
        onChange={e=>onChange(e.target.value || null)}>
        <option value="">Automatique (d&apos;après le nom du client)</option>
        {showInitial && <option value={initial}>Compte actuel (inactif ou introuvable)</option>}
        {accounts.map(a => (
          <option key={a.user_id} value={a.user_id}>{accountLabel(a)}</option>
        ))}
      </select>
    </FF>
  )
}
