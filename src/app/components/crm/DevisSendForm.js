'use client'
import { useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { parseEmails } from '../../lib/devisAi'

/**
 * Fenêtre d'envoi d'un devis par mail (contenu de modale).
 *
 * initial   : { to, cc, subject, body } pré-rempli par le parent
 * filename  : nom de la pièce jointe (PDF édité par Qonto)
 * onPreviewPdf : () => void — ouvre le PDF Qonto pour vérification
 * onDraftAi : () => Promise<{ subject, body }> — absent = bouton IA masqué
 * canSign   : propose la signature électronique (Odoo Sign)
 * onSubmit  : ({ to, cc, subject, body, copyMe, sign }) => Promise<void>
 */
export default function DevisSendForm({ initial = {}, filename, sending, error, canSign, onPreviewPdf, onDraftAi, onSubmit, onCancel }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '', copyMe: true, sign: !!canSign, ...initial })
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
    if (form.sign && to.list.length !== 1) { setLocalError('Signature électronique : un seul destinataire (le signataire).'); return }
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
        <span style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 8px' }}>📎 {filename} · Qonto</span>
        {onPreviewPdf && (
          <button type="button" onClick={onPreviewPdf} style={{ ...btnS, fontSize: 12, padding: '5px 10px', minHeight: 30 }}>
            👁 Vérifier le PDF Qonto
          </button>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.copyMe} onChange={e => set('copyMe', e.target.checked)} />
          M’envoyer une copie
        </label>
        {canSign && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, color: '#1E3A5F' }}>
            <input type="checkbox" checked={form.sign} onChange={e => set('sign', e.target.checked)} />
            ✍️ Signature électronique
          </label>
        )}
        {onDraftAi && (
          <button type="button" onClick={draft} disabled={drafting || sending}
            style={{ ...btnS, fontSize: 12, padding: '5px 10px', minHeight: 30, marginLeft: 'auto' }}>
            {drafting ? 'Rédaction…' : '✨ Rédiger avec l’IA'}
          </button>
        )}
      </div>
      {canSign && form.sign && (
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
          Le client reçoit aussi un e-mail d’Odoo Sign pour signer le devis en ligne.
        </div>
      )}
      {shownError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {shownError}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnS}>Annuler</button>
        <button onClick={submit} disabled={sending} style={{ ...btnP, opacity: sending ? 0.6 : 1 }}>
          {sending ? 'Envoi…' : form.sign ? '📤 Envoyer pour signature' : '📤 Envoyer le devis'}
        </button>
      </div>
    </div>
  )
}
