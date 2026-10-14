'use client'
import { useEffect, useMemo, useState } from 'react'
import { FF, inp, btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import { useToast } from '../../contexts/ToastContext'
import { apiPost } from '../../lib/crmApi'
import { COMPANY } from '../../lib/company'
import { localISO } from '../../lib/today'
import { parseEmails } from '../../lib/devisAi'
import { markMiseEnDemeure } from '../../lib/crDb'
import { DELAI_DEFAUT, adresseOf, miseEnDemeureText, miseEnDemeureMail } from '../../lib/miseEnDemeure'

const fmt = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')

/**
 * Courrier de mise en demeure d'une entreprise dont des actions ont été
 * relancées trois fois sans effet : points concernés (cochés), délai, PDF à
 * envoyer en recommandé avec accusé de réception, copie par mail possible.
 * La date du courrier est notée sur les tâches (migration 046) et apparaît
 * dans les comptes rendus suivants.
 */
export default function CRMiseEnDemeureModal({ open, entreprise, points = [], chantier, contacts = [], onClose, onDone }) {
  const { addToast } = useToast()
  const [keep, setKeep] = useState({})
  const [delai, setDelai] = useState(DELAI_DEFAUT)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const dest = useMemo(() => adresseOf(contacts, entreprise), [contacts, entreprise])

  // Valeurs proposées à l'ouverture (pas à chaque mise à jour des points)
  useEffect(() => {
    if (!open) return
    setKeep(Object.fromEntries(points.map(p => [p.key, true])))
    setDelai(DELAI_DEFAUT)
    setEmail(dest.email || '')
    setBusy('')
  }, [open, entreprise]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = points.filter(p => keep[p.key])
  const today = localISO()
  const text = miseEnDemeureText({ entreprise, chantier: chantier || {}, points: chosen, delai: Number(delai) || DELAI_DEFAUT, date: today, company: COMPANY })

  const done = async () => {
    const ok = await markMiseEnDemeure(chosen.map(p => p.id), { date: today, entreprise, chantierId: chantier?.id || null })
    if (!ok) addToast('Courrier prêt, mais sa date n’a pas été notée sur les points (migration 046).', 'warning')
    onDone?.(chosen.map(p => p.id), today)
  }

  const download = async () => {
    if (busy || !chosen.length) return
    setBusy('pdf')
    try {
      const { generateMiseEnDemeurePdf } = await import('../../generators')
      await generateMiseEnDemeurePdf({ text, dest, chantier })
      await done()
      addToast('Courrier téléchargé : envoie-le en recommandé avec accusé de réception.', 'success')
      onClose()
    } catch (e) {
      addToast(e?.message || 'Courrier impossible', 'error')
    } finally { setBusy('') }
  }

  const sendMail = async () => {
    if (busy || !chosen.length) return
    const to = parseEmails(email)
    if (to.list.length !== 1 || to.invalid.length) { addToast('Adresse email invalide.', 'error'); return }
    setBusy('mail')
    try {
      const { generateMiseEnDemeurePdf } = await import('../../generators')
      const pdf = await generateMiseEnDemeurePdf({ text, dest, chantier }, { returnBase64: true })
      await apiPost('/api/cr/send', {
        subject: text.objet, filename: pdf.filename, pdfBase64: pdf.base64,
        messages: [{ to: to.list[0], text: miseEnDemeureMail({ text, company: COMPANY }) }],
      })
      await done()
      addToast(`Mise en demeure envoyée à ${to.list[0]} : envoie aussi l’original en recommandé avec accusé de réception.`, 'success')
      onClose()
    } catch (e) {
      addToast(e?.message || 'Envoi impossible', 'error')
    } finally { setBusy('') }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} wide title={`Mise en demeure — ${entreprise}`}>
      <p style={{ fontSize: 13, color: 'var(--label-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Ces points ont été relancés plusieurs fois sans effet. Le courrier rappelle les demandes des comptes rendus et fixe un dernier délai.
        Relis-le, puis envoie-le en recommandé avec accusé de réception : c&apos;est ce qui lui donne sa valeur.
      </p>
      <FF label="Points concernés">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {points.map(p => (
            <label key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--separator)', background: keep[p.key] ? 'var(--row-fill)' : '#fff', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!keep[p.key]} onChange={e => setKeep(k => ({ ...k, [p.key]: e.target.checked }))}
                style={{ width: 17, height: 17, marginTop: 1, accentColor: 'var(--system-blue)' }} />
              <span>
                {p.num ? `n°${p.num} ` : ''}<b>{p.titre}</b>
                <span style={{ color: 'var(--label-secondary)' }}>
                  {[p.echeance ? ` — attendu le ${fmt(p.echeance)}` : '', p.rappels ? `, relancé ${p.rappels} fois` : ''].join('')}
                </span>
              </span>
            </label>
          ))}
        </div>
      </FF>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
        <FF label="Délai (jours)">
          <input style={inp} type="number" min="1" max="60" value={delai} onChange={e => setDelai(e.target.value)} aria-label="Délai en jours" />
        </FF>
        <FF label="Destinataire" hint={dest.lignes.length ? `${dest.nom} · ${dest.lignes.join(', ')}` : 'Adresse postale absente de la fiche contact : complète-la sur le courrier.'}>
          <input style={inp} type="text" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email de l’entreprise (copie par mail)" aria-label="Email de l’entreprise" />
        </FF>
      </div>
      <details style={{ margin: '4px 0 10px' }}>
        <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--accent-text)' }}>Lire le courrier</summary>
        <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid var(--separator)', borderRadius: 8, padding: 12, marginTop: 6 }}>
          {[`Objet : ${text.objet}`, ...text.paragraphes.map(p => (p === '__POINTS__' ? text.points.map(l => `- ${l}`).join('\n') : p)), text.signature].join('\n\n')}
        </div>
      </details>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} disabled={!!busy} style={btnS}>Plus tard</button>
        <button type="button" onClick={sendMail} disabled={!!busy || !chosen.length || !email.trim()} style={btnS}>
          {busy === 'mail' ? 'Envoi…' : 'Envoyer une copie par mail'}
        </button>
        <button type="button" onClick={download} disabled={!!busy || !chosen.length} style={btnP}>
          {busy === 'pdf' ? 'Préparation…' : 'Télécharger le courrier (PDF)'}
        </button>
      </div>
    </Modal>
  )
}
