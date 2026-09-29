'use client'
import { useEffect, useRef, useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { parseEmails } from '../../lib/devisAi'

/**
 * Fenêtre d'envoi d'un devis par mail (contenu de modale).
 *
 * initial   : { to, cc, subject, body } pré-rempli par le parent
 * filename  : nom de la pièce jointe (PDF édité par Qonto)
 * onPreviewPdf : () => void — ouvre le PDF Qonto pour vérification
 * onDraftAi : () => Promise<{ subject, body }> — absent = bouton IA masqué
 * canSign   : propose la signature électronique (lien de signature en ligne)
 * docsApi   : pièces jointes en plus du devis — absent = section masquée
 *             { list: () => Promise<docs>, upload: (file, permanent) => Promise<doc>,
 *               remove: (doc) => Promise<boolean> } ; doc = { path, name }
 *             Documents permanents (Kbis, décennale…) cochés par défaut.
 * onSubmit  : ({ to, cc, subject, body, copyMe, sign, attachments }) => Promise<void>
 *             attachments : chemins des pièces jointes cochées / ajoutées
 */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx'
const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F5F9', border: '1px solid #E2E8F0',
  borderRadius: 6, padding: '4px 8px', maxWidth: '100%',
}
const chipX = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14, lineHeight: 1,
  padding: '0 2px', fontFamily: 'inherit',
}
const smallBtn = { ...btnS, fontSize: 12, padding: '5px 10px', minHeight: 30 }

export default function DevisSendForm({ initial = {}, filename, sending, error, canSign, docsApi, onPreviewPdf, onDraftAi, onSubmit, onCancel }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '', copyMe: true, sign: !!canSign, ...initial })
  const [localError, setLocalError] = useState('')
  const [drafting, setDrafting] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ─── Pièces jointes ───
  const [docs, setDocs] = useState([])          // documents permanents
  const [unchecked, setUnchecked] = useState(() => new Set())
  const [extras, setExtras] = useState([])      // fichiers joints pour cet envoi
  const [uploading, setUploading] = useState(false)
  const [docsError, setDocsError] = useState('')
  const fileRef = useRef(null)
  const permRef = useRef(null)
  useEffect(() => {
    if (!docsApi) return
    let alive = true
    docsApi.list().then(d => { if (alive) setDocs(d || []) })
      .catch(e => { if (alive) setDocsError(e?.message || 'Documents indisponibles.') })
    return () => { alive = false }
  }, [docsApi])

  const toggleDoc = (path) => setUnchecked(u => {
    const n = new Set(u)
    if (n.has(path)) n.delete(path); else n.add(path)
    return n
  })
  const addFiles = async (files, permanent) => {
    if (!files?.length) return
    setUploading(true); setDocsError('')
    try {
      for (const file of Array.from(files)) {
        const doc = await docsApi.upload(file, permanent)
        if (permanent) setDocs(d => [...d, doc].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
        else setExtras(x => [...x, doc])
      }
    } catch (e) { setDocsError(e?.message || 'Ajout du fichier impossible.') }
    finally { setUploading(false) }
  }
  const removeDoc = async (doc) => {
    try { if (await docsApi.remove(doc)) setDocs(d => d.filter(x => x.path !== doc.path)) }
    catch (e) { setDocsError(e?.message || 'Suppression impossible.') }
  }
  const attachments = [...docs.filter(d => !unchecked.has(d.path)), ...extras].map(d => d.path)

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
    if (uploading) { setLocalError('Patiente : fichier en cours d’ajout.'); return }
    setLocalError('')
    onSubmit({ ...form, attachments })
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
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
        Pièces jointes
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: '#334155' }}>
        <span style={chip}>📎 {filename} · Qonto</span>
        {onPreviewPdf && (
          <button type="button" onClick={onPreviewPdf} style={smallBtn}>👁 Vérifier le PDF Qonto</button>
        )}
        {docs.map(d => {
          const on = !unchecked.has(d.path)
          return (
            <span key={d.path} style={{ ...chip, background: on ? '#EFF6FF' : '#F8FAFC', borderColor: on ? '#BFDBFE' : '#E2E8F0', color: on ? '#1E3A5F' : '#94A3B8' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => toggleDoc(d.path)} aria-label={`Joindre ${d.name}`} />
                {d.name}
              </label>
              <button type="button" onClick={() => removeDoc(d)} aria-label={`Retirer ${d.name} des documents permanents`}
                title="Retirer des documents permanents" style={chipX}>×</button>
            </span>
          )
        })}
        {extras.map(d => (
          <span key={d.path} style={{ ...chip, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E3A5F' }}>
            📎 {d.name}
            <button type="button" onClick={() => setExtras(x => x.filter(e => e.path !== d.path))}
              aria-label={`Enlever ${d.name}`} style={chipX}>×</button>
          </span>
        ))}
        {docsApi && (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              title="Joindre un fichier à ce mail" style={smallBtn}>
              {uploading ? 'Ajout…' : '📎 Joindre un fichier'}
            </button>
            <button type="button" onClick={() => permRef.current?.click()} disabled={uploading}
              title="Document proposé à chaque envoi de devis (Kbis, attestation décennale…)" style={smallBtn}>
              + Document permanent
            </button>
            <input ref={fileRef} type="file" multiple hidden accept={ACCEPT} aria-label="Fichier à joindre"
              onChange={e => { addFiles(e.target.files, false); e.target.value = '' }} />
            <input ref={permRef} type="file" hidden accept={ACCEPT} aria-label="Document permanent"
              onChange={e => { addFiles(e.target.files, true); e.target.value = '' }} />
          </>
        )}
      </div>
      {docsError && <div role="alert" style={{ color: '#B45309', fontSize: 12, margin: '-6px 0 10px' }}>⚠ {docsError}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: '#334155' }}>
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
          Un lien sécurisé est ajouté au mail : le client consulte le devis et le signe en ligne.
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
