'use client'
// Page publique de réponse à la relance d'un devis : /reponse/<jeton>?r=<raison>
//
// Le client (sans compte) arrive depuis un bouton du mail de relance, la
// raison cliquée est présélectionnée ; il peut la changer, ajouter une
// précision, puis confirme. Voir /api/devis/reponse.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const C = { navy: '#1E3A5F', text: '#0F172A', muted: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' }
const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }
const btn = {
  width: '100%', minHeight: 48, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
}

export default function ReponseDevisPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [raison, setRaison] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/devis/reponse?t=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Lien invalide')
        setInfo(j.data)
        const pre = new URLSearchParams(window.location.search).get('r')
        setRaison(j.data.raisons.some(x => x.code === pre) ? pre : (j.data.derniere?.raison || ''))
      })
      .catch(e => setLoadError(e.message))
  }, [token])

  const submit = async () => {
    setError('')
    if (!raison) { setError('Choisissez une réponse.'); return }
    if (raison === 'autre' && commentaire.trim().length < 2) { setError('Précisez votre réponse.'); return }
    setSending(true)
    try {
      const r = await fetch('/api/devis/reponse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, raison, commentaire: commentaire.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Envoi impossible')
      setDone(true)
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  const shell = (children) => (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '24px 16px', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', color: C.text }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>ID Maîtrise</div>
          <div style={{ fontSize: 12, color: C.muted }}>Ingénierie de la construction · Le Havre</div>
        </div>
        {children}
      </div>
    </main>
  )

  if (loadError) return shell(<div style={card} role="alert">{loadError}</div>)
  if (!info) return shell(<div style={card} role="status">Chargement…</div>)
  if (done) {
    return shell(
      <div style={{ ...card, borderColor: '#A7F3D0', background: '#ECFDF5' }} role="status">
        <div style={{ fontSize: 18, fontWeight: 700, color: '#047857', marginBottom: 6 }}>✓ Merci pour votre réponse</div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          Elle a bien été transmise à notre équipe. Si besoin, nous revenons vers vous rapidement.
        </div>
      </div>,
    )
  }

  return shell(
    <div style={card}>
      <div style={{ fontSize: 13, color: C.muted }}>Devis n° {info.numero}</div>
      <h1 style={{ fontSize: 19, margin: '4px 0 6px' }}>{info.objet || 'Votre devis'}</h1>
      <p style={{ fontSize: 14, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Où en est votre réflexion ? Choisissez la réponse qui correspond à votre situation.
      </p>
      {info.derniere && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Vous avez déjà répondu le {new Date(info.derniere.created_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} : vous pouvez modifier votre réponse.
        </div>
      )}
      <div role="radiogroup" aria-label="Votre réponse" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {info.raisons.map(r => {
          const on = raison === r.code
          return (
            <label key={r.code} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 15, lineHeight: 1.4,
              border: `1.5px solid ${on ? C.navy : C.border}`, background: on ? '#EEF2F7' : '#fff',
            }}>
              <input type="radio" name="raison" value={r.code} checked={on} onChange={() => setRaison(r.code)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: C.navy, flexShrink: 0 }} />
              <span>{r.code === 'autre' ? 'Autre (précisez ci-dessous)' : r.label}</span>
            </label>
          )
        })}
      </div>
      <label htmlFor="reponse-commentaire" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {raison === 'autre' ? 'Votre réponse' : 'Une précision ? (facultatif)'}
      </label>
      <textarea id="reponse-commentaire" value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={3} maxLength={1000}
        placeholder={raison === 'autre' ? 'Dites-nous en quelques mots…' : 'Par exemple : budget visé, date de reprise du projet…'}
        style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
      {error && <div role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
      <button onClick={submit} disabled={sending} style={{ ...btn, background: C.navy, color: '#fff', opacity: sending ? 0.6 : 1 }}>
        {sending ? 'Envoi…' : 'Envoyer ma réponse'}
      </button>
    </div>,
  )
}
