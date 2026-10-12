'use client'
// Page publique de réponse au mail de reprise de contact d'une affaire en
// attente : /reprise/<jeton>?r=<choix>
//
// Le client (sans compte) arrive depuis un bouton du mail, le choix cliqué
// est présélectionné ; il peut le changer, ajouter une précision, puis
// confirme. Voir /api/crm/reprise.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const C = { navy: '#1E3A5F', text: '#0F172A', muted: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' }
const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }
const btn = {
  width: '100%', minHeight: 48, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
}

export default function RepriseProjetPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [choix, setChoix] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/crm/reprise?t=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Lien invalide')
        setInfo(j.data)
        const pre = new URLSearchParams(window.location.search).get('r')
        setChoix(j.data.choix.some(x => x.code === pre) ? pre : '')
      })
      .catch(e => setLoadError(e.message))
  }, [token])

  const submit = async () => {
    setError('')
    if (!choix) { setError('Choisissez une réponse.'); return }
    if (choix === 'autre' && commentaire.trim().length < 2) { setError('Précisez votre réponse.'); return }
    setSending(true)
    try {
      const r = await fetch('/api/crm/reprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, choix, commentaire: commentaire.trim() }),
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
      <h1 style={{ fontSize: 19, margin: '0 0 6px' }}>Où en est votre projet ?</h1>
      <p style={{ fontSize: 14, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Vous nous aviez indiqué que votre projet était en pause{info.motif ? ` (${info.motif.charAt(0).toLowerCase()}${info.motif.slice(1)})` : ''}.
        Choisissez la réponse qui correspond à votre situation : nous nous adaptons à votre calendrier.
      </p>
      <div role="radiogroup" aria-label="Votre réponse" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {info.choix.map(r => {
          const on = choix === r.code
          return (
            <label key={r.code} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 15, lineHeight: 1.4,
              border: `1.5px solid ${on ? C.navy : C.border}`, background: on ? '#EEF2F7' : '#fff',
            }}>
              <input type="radio" name="choix" value={r.code} checked={on} onChange={() => setChoix(r.code)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: C.navy, flexShrink: 0 }} />
              <span>{r.code === 'autre' ? 'Autre (précisez ci-dessous)' : r.label}</span>
            </label>
          )
        })}
      </div>
      <label htmlFor="reprise-commentaire" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {choix === 'autre' ? 'Votre réponse' : 'Une précision ? (facultatif)'}
      </label>
      <textarea id="reprise-commentaire" value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={3} maxLength={1000}
        placeholder={choix === 'autre' ? 'Dites-nous en quelques mots…' : 'Par exemple : date de démarrage souhaitée, budget, évolution du projet…'}
        style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
      {error && <div role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
      <button onClick={submit} disabled={sending} style={{ ...btn, background: C.navy, color: '#fff', opacity: sending ? 0.6 : 1 }}>
        {sending ? 'Envoi…' : 'Envoyer ma réponse'}
      </button>
    </div>,
  )
}
