'use client'
import { useEffect, useMemo, useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import { useToast } from '../../contexts/ToastContext'
import { apiPost } from '../../lib/crmApi'
import { parseEmails } from '../../lib/devisAi'
import { COMPANY } from '../../lib/company'
import { loadCrImages } from '../../lib/crPhotos'
import { crMailSubject, crMailIntro, crMailText, actionsFor } from '../../lib/crSuivi'

/**
 * Envoi d'un CR par mail : PDF (page de garde + convocation) joint, un mail
 * par destinataire avec la convocation et ses propres actions / relances.
 * Sans SMTP configuré : PDF téléchargé + mail pré-rempli.
 */
export default function CRSendModal({ cr, chantier, onClose, onSent }) {
  const { addToast } = useToast()
  const [subject, setSubject] = useState('')
  const [intro, setIntro] = useState('')
  const [checked, setChecked] = useState({})
  const [extra, setExtra] = useState('')
  const [preview, setPreview] = useState(null)
  const [sending, setSending] = useState(false)

  const people = useMemo(() => (cr?.intervenants || []).filter(it => it.email), [cr])
  const noEmail = useMemo(() => (cr?.intervenants || []).filter(it => !it.email), [cr])

  useEffect(() => {
    if (!cr) return
    setSubject(crMailSubject(cr, chantier))
    setIntro(crMailIntro(cr, chantier))
    setChecked(Object.fromEntries(people.map(it => [it.email, true])))
    setExtra('')
    setPreview(null)
  }, [cr, chantier, people])

  const extraEmails = parseEmails(extra)
  const recipients = [
    ...people.filter(it => checked[it.email]),
    ...extraEmails.list.filter(e => !people.some(p => p.email.toLowerCase() === e.toLowerCase()))
      .map(email => ({ nom: '', email, convoque: true })),
  ]

  const send = async () => {
    if (sending) return
    if (extraEmails.invalid.length) { addToast(`Adresse invalide : ${extraEmails.invalid.join(', ')}`, 'error'); return }
    if (!recipients.length) { addToast('Choisis au moins un destinataire.', 'error'); return }
    setSending(true)
    try {
      const { generateCRPdf } = await import('../../generators')
      const pdf = await generateCRPdf(cr, chantier, { returnBase64: true, images: await loadCrImages(cr) })
      const messages = recipients.map(it => ({ to: it.email, text: crMailText({ intro, cr, it, company: COMPANY }) }))
      try {
        const res = await apiPost('/api/cr/send', { subject, messages, pdfBase64: pdf.base64, filename: pdf.filename })
        const failed = res.failed || []
        addToast(`CR n°${cr.numero} envoyé à ${res.sent.length} destinataire${res.sent.length > 1 ? 's' : ''}`
          + (failed.length ? ` — échec : ${failed.map(f => f.to).join(', ')}` : ''), failed.length ? 'warning' : 'success')
        await onSent?.(cr)
        onClose()
      } catch (e) {
        if (e.code !== 'EMAIL_NOT_CONFIGURED') throw e
        // Pas de SMTP : PDF téléchargé + mail pré-rempli (destinataires en copie cachée)
        const a = document.createElement('a')
        a.href = pdf.base64; a.download = pdf.filename; a.click()
        const body = crMailText({ intro, cr, it: { nom: '', convoque: true }, company: COMPANY })
        window.location.href = `mailto:?bcc=${encodeURIComponent(recipients.map(r => r.email).join(','))}`
          + `&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        addToast('Envoi automatique non configuré : PDF téléchargé, joins-le au mail qui s’ouvre.', 'info')
        await onSent?.(cr)
        onClose()
      }
    } catch (e) {
      addToast(e?.message || 'Envoi impossible', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={!!cr} onClose={() => !sending && onClose()} wide
      title={cr ? `Envoyer le CR n°${cr.numero}${cr.prochaine_reunion?.date ? ' et la convocation' : ''}` : ''}>
      {cr && <>
        <FF label="Destinataires">
          {people.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '10px 12px' }}>
              Aucun intervenant du CR n&apos;a d&apos;adresse email. Ajoute-les dans leur fiche contact, ou saisis les adresses ci-dessous.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {people.map(it => {
                const acts = actionsFor(cr.taches_suivi, it)
                const late = acts.filter(a => a.suivi === 'relance').length
                return (
                  <div key={it.email} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: checked[it.email] ? '#EFF6FF' : '#fff', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!checked[it.email]}
                        onChange={e => setChecked(c => ({ ...c, [it.email]: e.target.checked }))}
                        style={{ width: 17, height: 17, accentColor: '#3B82F6' }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{it.nom}</span>
                      <span style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.email}</span>
                    </label>
                    {it.convoque !== false && cr.prochaine_reunion?.date && <span style={{ fontSize: 10, fontWeight: 700, color: '#1E3A5F' }}>convoqué</span>}
                    {acts.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: late ? '#B91C1C' : '#7C3AED' }}>{acts.length} action{acts.length > 1 ? 's' : ''}{late ? ` · ${late} relance${late > 1 ? 's' : ''}` : ''}</span>}
                    <button type="button" onClick={() => setPreview(preview === it.email ? null : it.email)}
                      style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {preview === it.email ? 'Masquer' : 'Aperçu'}
                    </button>
                    {preview === it.email && (
                      <pre style={{ width: '100%', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: '#334155', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, padding: 10, margin: '4px 0 0' }}>
                        {crMailText({ intro, cr, it, company: COMPANY })}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {noEmail.length > 0 && (
            <div style={{ fontSize: 11, color: '#B45309', marginTop: 6 }}>
              Sans email : {noEmail.map(it => it.nom).join(', ')}
            </div>
          )}
        </FF>
        <FF label="Autres destinataires (séparés par des virgules)">
          <input style={inp} type="text" inputMode="email" value={extra} onChange={e => setExtra(e.target.value)} placeholder="bureau.controle@exemple.fr" />
        </FF>
        <FF label="Objet">
          <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} />
        </FF>
        <FF label="Message" hint="La convocation et les actions de chaque destinataire sont ajoutées automatiquement.">
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={intro} onChange={e => setIntro(e.target.value)} />
        </FF>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose} disabled={sending} style={btnS}>Plus tard</button>
          <button type="button" onClick={send} disabled={sending || !recipients.length || !subject.trim()} style={btnP}>
            {sending ? 'Envoi…' : `Envoyer à ${recipients.length} destinataire${recipients.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </>}
    </Modal>
  )
}
