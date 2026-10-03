'use client'
// Page publique de dépôt des documents administratifs : /deposer/<jeton>
//
// L'entreprise (sans compte) dépose son Kbis, son attestation décennale,
// son attestation fiscale et son attestation URSSAF (PDF ou photo). Les
// dates sont lues automatiquement. Voir /api/conformite/public.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { uploadConformiteDoc, publicPost } from '../../lib/conformiteClient'

const C = { navy: '#1E3A5F', text: '#0F172A', muted: '#64748B', border: '#E2E8F0', bg: '#F8FAFC' }
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')
const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }
const STATE = {
  ok: { label: 'Reçu, à jour', color: '#047857', bg: '#ECFDF5' },
  bientot: { label: 'Expire bientôt : merci d’envoyer le nouveau', color: '#B45309', bg: '#FFFBEB' },
  a_verifier: { label: 'Reçu, en cours de vérification', color: '#C2410C', bg: '#FFF7ED' },
  a_renvoyer: { label: 'À renvoyer', color: '#B91C1C', bg: '#FEF2F2' },
  manquant: { label: 'À fournir', color: '#B91C1C', bg: '#FEF2F2' },
  expire: { label: 'Expiré : merci d’envoyer le nouveau', color: '#B91C1C', bg: '#FEF2F2' },
}

export default function DeposerDocumentsPage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [lastSent, setLastSent] = useState('')
  const fileRef = useRef(null)
  const kindRef = useRef(null)

  useEffect(() => {
    fetch(`/api/conformite/public?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Lien invalide')
        setInfo(j.data)
      })
      .catch(e => setLoadError(e.message))
  }, [token])

  const pick = (kind) => { kindRef.current = kind; setError(''); fileRef.current?.click() }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const kind = kindRef.current
    if (!file || !kind) return
    setBusy(kind)
    setError('')
    try {
      const state = await uploadConformiteDoc(publicPost(token), { kind, file })
      setInfo(i => ({ ...i, ...state }))
      setLastSent(info?.documents?.find(d => d.kind === kind)?.label || 'Document')
    } catch (err) {
      setError(err.message)
    } finally { setBusy(null) }
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

  const remaining = info.documents.filter(d => ['manquant', 'expire', 'bientot', 'a_renvoyer'].includes(d.status)).length
  return shell(
    <>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={onFile} style={{ display: 'none' }} />
      <div style={card}>
        <h1 style={{ fontSize: 19, margin: '0 0 6px' }}>Documents administratifs</h1>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{info.entreprise}</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
          Déposez ci-dessous vos documents à jour (PDF ou photo bien lisible). Aucun compte n’est nécessaire.
          {info.expireLe && <> Lien valable jusqu’au {fmtD(info.expireLe)}.</>}
        </div>
      </div>

      {lastSent && (
        <div role="status" style={{ ...card, background: '#ECFDF5', borderColor: '#A7F3D0', color: '#065F46', fontSize: 14 }}>
          ✓ {lastSent} bien reçu, merci.{remaining === 0 ? ' Tous vos documents sont à jour.' : ''}
        </div>
      )}
      {error && <div role="alert" style={{ ...card, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', fontSize: 14 }}>{error}</div>}

      {info.documents.map(d => {
        const st = STATE[d.status] || STATE.manquant
        return (
          <div key={d.kind} style={card}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{d.label}</div>
            <div style={{ fontSize: 12, color: C.muted, margin: '2px 0 8px', lineHeight: 1.4 }}>{d.aide}</div>
            <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 999, padding: '3px 10px', marginBottom: 10 }}>
              {st.label}{d.valideAu && (d.status === 'ok' || d.status === 'bientot') ? ` (jusqu’au ${fmtD(d.valideAu)})` : ''}
            </div>
            {d.motif && <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10 }}>{d.motif}</div>}
            <button type="button" onClick={() => pick(d.kind)} disabled={!!busy}
              style={{
                width: '100%', minHeight: 46, borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
                fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
                background: d.status === 'ok' || d.status === 'a_verifier' ? '#EEF2F7' : C.navy,
                color: d.status === 'ok' || d.status === 'a_verifier' ? C.navy : '#fff',
                opacity: busy && busy !== d.kind ? 0.6 : 1,
              }}>
              {busy === d.kind ? 'Envoi et lecture du document…' : d.status === 'manquant' ? 'Déposer le document' : 'Envoyer une nouvelle version'}
            </button>
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 4 }}>
        Vos documents sont transmis uniquement à ID Maîtrise.
      </div>
    </>
  )
}
