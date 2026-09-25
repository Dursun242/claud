'use client'
// Page publique de signature d'un devis : /signer/<jeton>
//
// Le client (sans compte) consulte le devis Qonto, saisit son nom, signe au
// doigt ou à la souris et coche « Bon pour accord ». Voir /api/devis/public.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const C = { navy: '#1E3A5F', text: '#0F172A', muted: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' }
const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }
const btn = {
  width: '100%', minHeight: 48, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
}

function SignaturePad({ onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const empty = useRef(true)

  useEffect(() => {
    const c = ref.current
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0B1F3A'
  }, [])

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e) => {
    e.preventDefault()
    ref.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const ctx = ref.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...pos(e))
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d')
    ctx.lineTo(...pos(e))
    ctx.stroke()
    empty.current = false
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(empty.current ? null : ref.current.toDataURL('image/png'))
  }
  const clear = () => {
    const c = ref.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    empty.current = true
    onChange(null)
  }

  return (
    <div>
      <canvas ref={ref} aria-label="Zone de signature"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        style={{ width: '100%', height: 170, border: `1.5px dashed ${C.navy}`, borderRadius: 10, background: '#fff', touchAction: 'none', display: 'block' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: C.muted }}>
        <span>Signez dans le cadre ci-dessus</span>
        <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: C.navy, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Effacer
        </button>
      </div>
    </div>
  )
}

export default function SignerDevisPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [signature, setSignature] = useState(null)
  const [accept, setAccept] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    fetch(`/api/devis/public?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Lien invalide')
        setInfo(j.data)
        setName(j.data.client || '')
      })
      .catch(e => setLoadError(e.message))
  }, [token])

  const pdfUrl = `/api/devis/public?token=${encodeURIComponent(token)}&pdf=1`

  const submit = async () => {
    setError('')
    if (name.trim().length < 2) { setError('Indiquez vos nom et prénom.'); return }
    if (!signature) { setError('Signez dans le cadre.'); return }
    if (!accept) { setError('Cochez « Bon pour accord ».'); return }
    setSending(true)
    try {
      const r = await fetch('/api/devis/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.trim(), signature, accept: true }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Signature impossible')
      setDone(j.data)
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
  if (!info) return shell(<div style={card} role="status">Chargement du devis…</div>)

  const signed = done || info.statut_signature === 'Signé'
  return shell(
    <>
      <div style={card}>
        <div style={{ fontSize: 13, color: C.muted }}>Devis n° {info.numero}</div>
        <h1 style={{ fontSize: 20, margin: '4px 0 10px' }}>{info.objet || 'Devis'}</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
          <span>Total HT</span><strong>{fmtEur(info.total_ht)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginBottom: 10 }}>
          <span>Total TTC</span><strong style={{ color: C.navy }}>{fmtEur(info.total_ttc)}</strong>
        </div>
        {info.date_validite && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Valable jusqu’au {fmtD(info.date_validite)}</div>}
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
          style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EEF2F7', color: C.navy, textDecoration: 'none' }}>
          📄 {signed ? 'Voir le devis signé' : 'Lire le devis (PDF)'}
        </a>
      </div>

      {signed ? (
        <div style={{ ...card, borderColor: '#A7F3D0', background: '#ECFDF5' }} role="status">
          <div style={{ fontSize: 18, fontWeight: 700, color: '#047857', marginBottom: 6 }}>✓ Devis signé</div>
          <div style={{ fontSize: 14 }}>
            Signé par {done?.signed_name || info.signed_name}
            {(done?.signed_at || info.signed_at) && ` le ${new Date(done?.signed_at || info.signed_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`}.
            Merci pour votre confiance : nous revenons vers vous rapidement.
          </div>
        </div>
      ) : info.expired || info.refused ? (
        <div style={card} role="alert">
          Ce devis n’est plus valable à la signature. Contactez-nous : contact@id-maitrise.com
        </div>
      ) : (
        <div style={card}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Signature</h2>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }} htmlFor="signer-name">Nom et prénom</label>
          <input id="signer-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name"
            style={{ width: '100%', minHeight: 44, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px', fontSize: 16, marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <SignaturePad onChange={setSignature} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, margin: '16px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
            <span>Bon pour accord : j’ai lu et j’accepte ce devis ({fmtEur(info.total_ttc)} TTC).</span>
          </label>
          {error && <div role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 10, fontWeight: 500 }}>⚠ {error}</div>}
          <button onClick={submit} disabled={sending} style={{ ...btn, background: C.navy, color: '#fff', opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Signature…' : '✍️ Signer le devis'}
          </button>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
            Signature électronique : votre nom, la date, l’heure et votre adresse IP sont enregistrés et apposés sur le devis
            avec l’empreinte du document, à titre de preuve.
          </p>
        </div>
      )}
    </>,
  )
}
