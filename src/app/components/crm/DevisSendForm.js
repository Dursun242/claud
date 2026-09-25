'use client'
import { useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { parseEmails } from '../../lib/devisAi'

/**
 * Fenêtre d'envoi d'un devis par mail (contenu de modale).
 *
 * initial   : { to, cc, subject, body } pré-rempli par le parent
 * filename  : nom de la pièce jointe affichée
 * onDraftAi : () => Promise<{ subject, body }> — absent = bouton IA masqué
 * onSubmit  : ({ to, cc, subject, body, copyMe }) => Promise<void>
 */
export default function DevisSendForm({ initial = {}, filename, sending, error, onDraftAi, onSubmit, onCancel }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '', copyMe: true, ...initial })
  const [localError, setLocalError] = useState('')
  const [drafting, setDrafting] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const draft = async () => {
    setDrafting(true); setLocalError('')
    try {
      const r = await onDraftAi()
      setForm(f => ({ ...f, subject: r.subject || f.subject, body: r.body || f.body }))
    } catch (e) { setLocalError(e?.message || 'La rédaction a échoué.') }
    finally { setDrafting(false) }
  }

  const submit = () => {
    const to = parseEmails(form.to); const cc = parseEmails(form.cc)
    if (!to.list.length) { setLocalError('Indique au moins un destinataire.'); return }
    const bad = [...to.invalid, ...cc.invalid]
    if (bad.length) { setLocalError(`Adresse invalide : ${bad.join(', ')}`); return }
    if (!form.subject.trim() || !form.body.trim()) { setLocalError('Objet et message requis.'); return }
    setLocalError('')
    onSubmit(form)
  }

  const shownError = localError || error
  return (
    <div>
      <FF label="À" required>
        <input style={inp} inputMode="email" aria-label="Destinataire" value={form.to} autoFocus={!form.to}
          placeholder="client@exemple.fr" onChange={e => set('to', e.target.value)} />
      </FF>
      <FF label="Copie" hint="Optionnel — plusieurs adresses séparées par une virgule">
        <input style={inp} value={form.cc} onChange={e => set('cc', e.target.value)} />
      </FF>
      <FF label="Objet" required>
        <input style={inp} value={form.subject} onChange={e => set('subject', e.target.value)} />
      </FF>
      <FF label="Message" required>
        <textarea style={{ ...inp, minHeight: 180, resize: 'vertical', fontSize: 14 }} value={form.body}
          onChange={e => set('body', e.target.value)} />
      </FF>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: '#334155' }}>
        <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 8px' }}>📎 {filename}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.copyMe} onChange={e => set('copyMe', e.target.checked)} />
          M’envoyer une copie
        </label>
        {onDraftAi && (
          <button type="button" onClick={draft} disabled={drafting || sending}
            style={{ ...btnS, fontSize: 12, padding: '5px 10px', minHeight: 30, marginLeft: 'auto' }}>
            {drafting ? 'Rédaction…' : '✨ Rédiger avec l’IA'}
          </button>
        )}
      </div>
      {shownError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {shownError}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnS}>Annuler</button>
        <button onClick={submit} disabled={sending} style={{ ...btnP, opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Envoi…' : '📤 Envoyer le devis'}
        </button>
      </div>
    </div>
  )
}
