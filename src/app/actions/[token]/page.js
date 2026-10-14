'use client'
// Page publique de réponse d'une entreprise à ses actions de chantier :
// /actions/<jeton>
//
// L'entreprise (sans compte) arrive depuis le mail du compte rendu ou du
// rappel d'échéance. Pour chaque action ouverte : « C'est fait » (photo
// possible), « J'ai besoin de plus de temps » (nouvelle date) ou « Je ne suis
// pas d'accord » (explication). Voir /api/cr/actions.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { resizeImageForAI } from '../../lib/imageForAI'

const C = { navy: '#1E3A5F', text: '#0F172A', muted: '#64748B', border: '#E2E8F0', bg: '#F8FAFC', red: '#B91C1C', green: '#047857' }
const card = { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }
const input = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' }
const fmt = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const DONE = { fait: 'C’est fait', delai: 'Plus de temps demandé', desaccord: 'Désaccord' }

function ActionCard({ token, action, choix, today, onDone }) {
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [photo, setPhoto] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const late = action.echeance && action.echeance < today

  const pickPhoto = async (file) => {
    if (!file) return
    try {
      const { base64, mediaType } = await resizeImageForAI(file, { maxEdge: 1280, quality: 0.72 })
      setPhoto(`data:${mediaType};base64,${base64}`)
    } catch { setError('Photo illisible : essayez une autre image.') }
  }

  const submit = async () => {
    setError('')
    if (!type) { setError('Choisissez une réponse.'); return }
    if (type === 'delai' && !date) { setError('Indiquez la nouvelle date.'); return }
    if (type === 'desaccord' && commentaire.trim().length < 5) { setError('Expliquez en quelques mots votre désaccord.'); return }
    setSending(true)
    try {
      const r = await fetch('/api/cr/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, tacheId: action.id, type, date: type === 'delai' ? date : null, commentaire: commentaire.trim(), photo: type === 'fait' ? photo : null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Envoi impossible')
      onDone(action.id, { type, date: type === 'delai' ? date : null, le: new Date().toISOString() })
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>{action.num ? `${action.num}. ` : ''}{action.titre}</div>
      <div style={{ fontSize: 13, color: late ? C.red : C.muted, marginTop: 3 }}>
        {[action.lot, action.echeance ? `${late ? 'attendu depuis le' : 'pour le'} ${fmt(action.echeance)}` : null].filter(Boolean).join(' · ')}
      </div>
      {action.reponse && (
        <div style={{ fontSize: 13, color: C.green, marginTop: 6 }}>
          Déjà répondu le {fmt(action.reponse.le)} : {DONE[action.reponse.type]}{action.reponse.date ? ` (${fmt(action.reponse.date)})` : ''}. Vous pouvez répondre à nouveau.
        </div>
      )}
      <div role="radiogroup" aria-label={`Réponse : ${action.titre}`} style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {choix.map(c => {
          const on = type === c.code
          return (
            <label key={c.code} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 15,
              border: `1.5px solid ${on ? C.navy : C.border}`, background: on ? '#EEF2F7' : '#fff' }}>
              <input type="radio" name={`r-${action.id}`} checked={on} onChange={() => setType(c.code)}
                style={{ width: 18, height: 18, accentColor: C.navy, flexShrink: 0 }} />
              {c.label}
            </label>
          )
        })}
      </div>
      {type && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {type === 'delai' && (
            <label style={{ fontSize: 13, fontWeight: 600 }}>Nouvelle date
              <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={{ ...input, marginTop: 4 }} />
            </label>
          )}
          {type === 'fait' && (
            <label style={{ fontSize: 13, fontWeight: 600 }}>Photo (facultatif)
              <input type="file" accept="image/*" capture="environment" onChange={e => pickPhoto(e.target.files?.[0])} style={{ display: 'block', marginTop: 4, fontSize: 14 }} />
              {photo && <span style={{ fontSize: 12, color: C.green, fontWeight: 500 }}>Photo prête à envoyer</span>}
            </label>
          )}
          <label style={{ fontSize: 13, fontWeight: 600 }}>{type === 'desaccord' ? 'Votre explication' : 'Une précision ? (facultatif)'}
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={3} maxLength={1000}
              placeholder={type === 'desaccord' ? 'Expliquez pourquoi cette action ne vous revient pas, ou ce qui bloque…' : 'Par exemple : ce qui a été fait, ce qui reste…'}
              style={{ ...input, marginTop: 4, resize: 'vertical' }} />
          </label>
          {error && <div role="alert" style={{ color: C.red, fontSize: 13, fontWeight: 500 }}>⚠ {error}</div>}
          <button type="button" onClick={submit} disabled={sending}
            style={{ minHeight: 46, borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: C.navy, color: '#fff', opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Envoi…' : 'Envoyer ma réponse'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ActionsEntreprisePage() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [answered, setAnswered] = useState({})

  useEffect(() => {
    fetch(`/api/cr/actions?t=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'Lien invalide')
        setInfo(j.data)
      })
      .catch(e => setLoadError(e.message))
  }, [token])

  const shell = (children) => (
    <main style={{ minHeight: '100vh', background: C.bg, padding: '24px 16px', fontFamily: 'var(--font-ui, system-ui), sans-serif', color: C.text }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.navy }}>ID Maîtrise</div>
          <div style={{ fontSize: 12, color: C.muted }}>Maîtrise d’œuvre · Le Havre</div>
        </div>
        {children}
      </div>
    </main>
  )

  if (loadError) return shell(<div style={card} role="alert">{loadError}</div>)
  if (!info) return shell(<div style={card} role="status">Chargement…</div>)
  const pending = info.actions.filter(a => !answered[a.id])
  const done = info.actions.filter(a => answered[a.id])

  return shell(<>
    <div style={card}>
      <h1 style={{ fontSize: 19, margin: '0 0 6px' }}>Vos actions sur le chantier {info.chantier}</h1>
      <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.5 }}>
        {info.entreprise} : pour chaque action, indiquez où vous en êtes. Votre réponse est transmise à l’équipe et reprise au prochain compte rendu.
      </p>
    </div>
    {info.actions.length === 0 && (
      <div style={{ ...card, color: C.green }} role="status">Aucune action en attente de votre part sur ce chantier. Merci !</div>
    )}
    {pending.map(a => (
      <ActionCard key={a.id} token={token} action={a} choix={info.choix} today={info.today}
        onDone={(id, rep) => setAnswered(s => ({ ...s, [id]: rep }))} />
    ))}
    {done.map(a => (
      <div key={a.id} role="status" style={{ ...card, borderColor: '#A7F3D0', background: '#ECFDF5' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{a.num ? `${a.num}. ` : ''}{a.titre}</div>
        <div style={{ fontSize: 14, color: C.green, marginTop: 4 }}>
          ✓ Réponse envoyée : {DONE[answered[a.id].type]}{answered[a.id].date ? ` (nouvelle date le ${fmt(answered[a.id].date)})` : ''}. Merci.
        </div>
      </div>
    ))}
  </>)
}
