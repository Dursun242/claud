'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { FF, sel, inp } from '../../dashboards/shared'

const HINT = "Le client ne voit le chantier que s'il est rattaché à son compte."

const accountLabel = (a) => {
  const name = [a.prenom, a.nom].filter(Boolean).join(' ').trim()
  return name ? `${name} — ${a.email}` : a.email
}

// Compte client rattaché au chantier (chantiers.client_user_id), côté équipe.
// Liste chargée au montage (= ouverture du formulaire) via la RPC
// client_accounts. '' ↔ null = rattachement automatique d'après le nom.
// Client sans compte : son adresse Gmail (`email` / `onEmail`) le rattache
// à sa première connexion Google (à l'enregistrement du chantier,
// api/clients/invite). L'invitation par mail n'est jamais automatique :
// bouton `onSendInvite`, proposé une fois l'adresse enregistrée (`canSend`).
export default function ClientAccountField({ value, onChange, email = '', onEmail, canSend = false, sending = false, onSendInvite }) {
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

  // Adresse Gmail d'un client sans compte (affichée tant qu'aucun compte n'est choisi)
  const emailField = !value && onEmail ? (
    <FF label="Adresse Gmail du client" hint="Il verra ce chantier en se connectant avec ce compte Google.">
      <input style={inp} type="email" inputMode="email" autoComplete="off" value={email}
        onChange={e=>onEmail(e.target.value)} placeholder="client@gmail.com" aria-label="Adresse Gmail du client"/>
      {onSendInvite && email.trim() && (canSend ? (
        <button type="button" onClick={onSendInvite} disabled={sending}
          style={{marginTop:8,border:"1px solid var(--separator-opaque)",background:"#fff",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",color:"var(--accent-text)",opacity:sending?0.6:1}}>
          {sending ? "Envoi…" : "Envoyer l'invitation au client"}
        </button>
      ) : (
        <div style={{fontSize:12,color:"var(--label-secondary)",marginTop:6}}>
          Enregistre le chantier : tu pourras ensuite lui envoyer l&apos;invitation quand tu veux.
        </div>
      ))}
    </FF>
  ) : null

  if (failed) {
    return (<>
      <FF label="Compte client (accès au suivi)">
        <div style={{fontSize:12,color:"var(--label-secondary)"}}>
          Liste des comptes indisponible : rattachement automatique d&apos;après le nom du client.
        </div>
      </FF>
      {emailField}
    </>)
  }

  if (!accounts) {
    return (
      <FF label="Compte client (accès au suivi)" hint={HINT}>
        <select style={sel} disabled><option>Chargement…</option></select>
      </FF>
    )
  }

  const showInitial = initial && !accounts.some(a => a.user_id === initial)
  return (<>
    <FF label="Compte client (accès au suivi)" hint={HINT}>
      <select style={sel} value={value || ""}
        onChange={e=>onChange(e.target.value || null)}>
        <option value="">{email ? `Invité par son adresse (${email})` : "Automatique (d'après le nom du client)"}</option>
        {showInitial && <option value={initial}>Compte actuel (inactif ou introuvable)</option>}
        {accounts.map(a => (
          <option key={a.user_id} value={a.user_id}>{accountLabel(a)}</option>
        ))}
      </select>
    </FF>
    {emailField}
  </>)
}
