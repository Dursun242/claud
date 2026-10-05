'use client'
import { useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import { parseEmails } from '../../lib/devisAi'
import { RAISONS } from '../../lib/devisRelance'

/**
 * Relance d'un devis envoyé resté sans réponse : mail avec choix de réponse
 * pour le client (budget, autre proposition, projet reporté…, autre).
 *
 * state    : null | { devis, initial: { to, subject, intro, outro }, error }
 * onSubmit : ({ to, cc, subject, intro, outro, copyMe }) => Promise<void>
 */
export default function DevisRelanceModal({ state, sending, onSubmit, onClose }) {
  return (
    <Modal open={!!state} onClose={() => !sending && onClose()}
      title={state ? `Relancer le devis ${state.devis.numero}` : ''}>
      {state && <RelanceForm key={state.devis.id} initial={state.initial} error={state.error}
        sending={sending} onSubmit={onSubmit} onCancel={onClose} />}
    </Modal>
  )
}

function RelanceForm({ initial, error, sending, onSubmit, onCancel }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', intro: '', outro: '', copyMe: false, ...initial })
  const [localError, setLocalError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    const to = parseEmails(form.to); const cc = parseEmails(form.cc)
    if (!to.list.length) { setLocalError('Indique au moins un destinataire.'); return }
    const bad = [...to.invalid, ...cc.invalid]
    if (bad.length) { setLocalError(`Adresse invalide : ${bad.join(', ')}`); return }
    if (!form.subject.trim() || !form.intro.trim()) { setLocalError('Objet et message requis.'); return }
    setLocalError('')
    onSubmit(form)
  }

  const shownError = localError || error
  const area = { ...inp, minHeight: 110, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }
  return (
    <div>
      <FF label="À" required>
        <input style={inp} inputMode="email" aria-label="Destinataire" value={form.to} autoFocus={!form.to}
          placeholder="client@exemple.fr" onChange={e => set('to', e.target.value)} />
      </FF>
      <FF label="Copie" hint="Optionnel — plusieurs adresses séparées par une virgule">
        <input style={inp} aria-label="Copie" value={form.cc} onChange={e => set('cc', e.target.value)} />
      </FF>
      <FF label="Objet" required>
        <input style={inp} aria-label="Objet" value={form.subject} onChange={e => set('subject', e.target.value)} />
      </FF>
      <FF label="Début du message" required>
        <textarea style={area} aria-label="Début du message" value={form.intro} onChange={e => set('intro', e.target.value)} />
      </FF>
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', marginBottom: 6 }}>
          Choix proposés au client (boutons dans le mail)
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
          {RAISONS.map(r => <li key={r.code}>{r.code === 'autre' ? 'Autre (le client précise)' : r.label}</li>)}
        </ol>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
          Le client clique sur sa réponse et confirme : elle s’affiche sur le devis et vous êtes prévenu. Il peut aussi répondre au mail avec le numéro.
        </div>
      </div>
      <FF label="Fin du message">
        <textarea style={area} aria-label="Fin du message" value={form.outro} onChange={e => set('outro', e.target.value)} />
      </FF>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#334155', marginBottom: 12 }}>
        <input type="checkbox" checked={form.copyMe} onChange={e => set('copyMe', e.target.checked)} />
        M’envoyer une copie
      </label>
      {shownError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {shownError}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnS}>Annuler</button>
        <button onClick={submit} disabled={sending} style={{ ...btnP, opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Envoi…' : '✉ Envoyer la relance'}
        </button>
      </div>
    </div>
  )
}
