'use client'
import { useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { useConfirm } from '../../contexts/ConfirmContext'
import { DOC_KINDS, DOC_META, STATUS_META, relancePause } from '../../lib/conformite'
import { localISO } from '../../lib/today'
import RelanceControls from './RelanceControls'
import { uploadConformiteDoc } from '../../lib/conformiteClient'
import { conformitePost } from '../../hooks/useConformite'

const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')
const small = { fontSize: 11, color: '#64748B' }
const btn = (color, bg, border) => ({
  background: bg, color, border: `1px solid ${border}`, borderRadius: 6, padding: '5px 10px',
  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
})
const input = { padding: '6px 8px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }

function validity(k, kind) {
  if (!k.doc) return 'Aucun document'
  if (DOC_META[kind]?.sansExpiration) return 'Sans date de validité'
  if (!k.valideAu) return 'Date de validité inconnue : à saisir'
  if (k.jours < 0) return `Expiré depuis le ${fmtD(k.valideAu)}`
  if (k.jours === 0) return "Expire aujourd'hui"
  return `Valable jusqu’au ${fmtD(k.valideAu)} (${k.jours} jour${k.jours > 1 ? 's' : ''})`
}

function DatesForm({ doc, onSave, onCancel }) {
  const [dd, setDd] = useState(doc.date_document || '')
  const [fin, setFin] = useState(doc.kind === 'decennale' ? (doc.valide_au || '') : '')
  const [verifie, setVerifie] = useState(true)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try { await onSave({ date_document: dd || null, valide_au: fin || undefined, verifie }) } finally { setSaving(false) }
  }
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 3 }}>
        Date du document
        <input type="date" value={dd} onChange={e => setDd(e.target.value)} style={input} />
      </label>
      <label style={{ ...small, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {doc.kind === 'decennale' ? 'Fin de validité (écrite sur l’attestation)' : 'Fin de validité (laisser vide : calculée depuis la date du document)'}
        <input type="date" value={fin} onChange={e => setFin(e.target.value)} style={input} />
      </label>
      <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={verifie} onChange={e => setVerifie(e.target.checked)} />
        J’ai vérifié le document (efface les points à vérifier)
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={save} disabled={saving} style={btn('#fff', '#2563EB', '#2563EB')}>{saving ? '…' : 'Enregistrer'}</button>
        <button type="button" onClick={onCancel} style={btn('#475569', '#fff', '#CBD5E1')}>Annuler</button>
      </div>
    </div>
  )
}

/**
 * Documents administratifs d'une entreprise : état de chacun, dépôt,
 * correction des dates, demande envoyée à l'entreprise (lien de dépôt).
 */
export default function ConformiteModal({ open, onClose, contact, compliance, lastRequest, missingMigration, onChanged }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const fileRef = useRef(null)
  const [pendingKind, setPendingKind] = useState(null)
  const [busy, setBusy] = useState(null)
  const [editing, setEditing] = useState(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [link, setLink] = useState(null)

  useEffect(() => {
    if (open) { setEmail(contact?.email || ''); setLink(null); setEditing(null) }
  }, [open, contact?.id, contact?.email])

  if (!contact) return null

  const pick = (kind) => { setPendingKind(kind); fileRef.current?.click() }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const kind = pendingKind
    if (!file || !kind) return
    setBusy(kind)
    try {
      const doc = await uploadConformiteDoc(conformitePost, { kind, file, extra: { contactId: contact.id } })
      addToast(doc.anomalies?.length ? `${DOC_META[kind].label} enregistré : à vérifier` : `${DOC_META[kind].label} enregistré`, doc.anomalies?.length ? 'warning' : 'success')
      onChanged?.()
    } catch (err) {
      addToast(err.message, 'error')
    } finally { setBusy(null) }
  }

  const open_ = async (doc) => {
    try {
      const { url } = await conformitePost({ action: 'url', id: doc.id })
      window.open(url, '_blank', 'noopener')
    } catch (err) { addToast(err.message, 'error') }
  }

  const saveDates = async (doc, fields) => {
    try {
      await conformitePost({ action: 'update', id: doc.id, ...fields })
      addToast('Dates enregistrées', 'success')
      setEditing(null)
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') }
  }

  // RIB : vérifié auprès de l'entreprise → points effacés, IBAN reporté sur la fiche
  const confirmRib = async (doc) => {
    const ok = await confirm({
      title: 'RIB vérifié ?',
      message: 'Confirmez que vous avez vérifié ce RIB auprès de l’entreprise (par téléphone, au numéro habituel). Son IBAN deviendra celui de la fiche.',
      confirmLabel: 'Oui, vérifié',
    })
    if (!ok) return
    try {
      await conformitePost({ action: 'update', id: doc.id, verifie: true })
      addToast('RIB vérifié', 'success')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') }
  }

  const remove = async (doc) => {
    const ok = await confirm({
      title: `Supprimer ce document ?`, message: `${DOC_META[doc.kind].long} — ${doc.file_name || ''}`,
      confirmLabel: 'Supprimer', danger: true,
    })
    if (!ok) return
    try {
      await conformitePost({ action: 'delete', id: doc.id })
      addToast('Document supprimé', 'success')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') }
  }

  const request = async () => {
    setSending(true)
    try {
      const r = await conformitePost({ action: 'request', contactId: contact.id, email: email.trim() || undefined })
      setLink(r.link)
      addToast(r.sent ? `Demande envoyée à ${r.email}` : 'Lien de dépôt créé : copiez-le et envoyez-le à l’entreprise', r.sent ? 'success' : 'info')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') } finally { setSending(false) }
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); addToast('Lien copié', 'success') } catch { addToast('Copie impossible : sélectionnez le lien', 'warning') }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Documents — ${contact.societe || contact.nom}`} wide>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={onFile} style={{ display: 'none' }} />
      <div style={{ ...small, marginBottom: 12, lineHeight: 1.5 }}>
        Obligation de vigilance : Kbis de moins de 3 mois, décennale en cours de validité, attestations fiscale et URSSAF de moins de 6 mois. RIB : l’IBAN est comparé à celui de la fiche.
        Les dates sont lues automatiquement sur le document déposé ; vérifiez-les.
      </div>

      {missingMigration ? (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, fontSize: 12, color: '#9A3412' }}>
          Fonction non activée : appliquer la migration 036 dans Supabase (voir migrations/036_README.md).
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DOC_KINDS.map(kind => {
              const k = compliance.kinds[kind]
              const meta = STATUS_META[k.status]
              const doc = k.doc
              return (
                <div key={kind} style={{ border: `1px solid ${meta.border}`, borderLeft: `4px solid ${meta.color}`, borderRadius: 8, padding: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{DOC_META[kind].long}</div>
                      <div style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>{meta.label} · {validity(k, kind)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => pick(kind)} disabled={!!busy}
                        style={btn('#fff', '#2563EB', '#2563EB')}>
                        {busy === kind ? 'Lecture du document…' : doc ? 'Remplacer' : 'Déposer'}
                      </button>
                      {doc && <button type="button" onClick={() => open_(doc)} style={btn('#334155', '#fff', '#CBD5E1')}>Voir</button>}
                      {doc && !DOC_META[kind].sansExpiration && <button type="button" onClick={() => setEditing(editing === kind ? null : kind)} style={btn('#334155', '#fff', '#CBD5E1')}>Dates</button>}
                      {doc && DOC_META[kind].sansExpiration && doc.anomalies?.length > 0 && (
                        <button type="button" onClick={() => confirmRib(doc)} style={btn('#047857', '#fff', '#A7F3D0')}>J’ai vérifié</button>
                      )}
                      {doc && <button type="button" onClick={() => remove(doc)} aria-label={`Supprimer ${DOC_META[kind].long}`} style={btn('#B91C1C', '#fff', '#FECACA')}>✕</button>}
                    </div>
                  </div>
                  {doc && (
                    <div style={{ ...small, marginTop: 6, lineHeight: 1.5 }}>
                      {doc.file_name}{doc.date_document ? ` · du ${fmtD(doc.date_document)}` : ''}
                      {doc.depose_par === 'entreprise' ? ' · déposé par l’entreprise' : ''}
                      {doc.lecture === 'manuelle' ? ' · dates saisies à la main' : ''}
                      {kind === 'decennale' && (doc.assureur || doc.numero_police) && <div>Assureur : {[doc.assureur, doc.numero_police].filter(Boolean).join(' – ')}</div>}
                      {kind === 'decennale' && doc.activites && <div>Activités couvertes : {doc.activites}</div>}
                      {kind === 'rib' && (doc.iban || doc.raison_sociale) && (
                        <div>
                          {doc.raison_sociale ? `Titulaire : ${doc.raison_sociale}` : ''}
                          {doc.iban ? `${doc.raison_sociale ? ' · ' : ''}IBAN : ${doc.iban.replace(/(.{4})/g, '$1 ').trim()}` : ''}
                          {doc.bic ? ` · BIC : ${doc.bic}` : ''}
                        </div>
                      )}
                      {kind === 'urssaf' && doc.code_securite && (
                        <div>Code de sécurité : <b>{doc.code_securite}</b> (vérifiable sur urssaf.fr, rubrique « Vérifier une attestation »)</div>
                      )}
                    </div>
                  )}
                  {doc?.anomalies?.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, color: '#C2410C' }}>
                      {doc.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  )}
                  {editing === kind && doc && <DatesForm doc={doc} onSave={(f) => saveDates(doc, f)} onCancel={() => setEditing(null)} />}
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 14, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0C4A6E', marginBottom: 4 }}>Demander les documents à l’entreprise</div>
            <div style={{ ...small, marginBottom: 8 }}>
              Un mail lui envoie un lien (valable 30 jours) pour déposer elle-même ses documents, sans compte. Ensuite, elle est relancée automatiquement chaque semaine tant qu’un document manque, est erroné ou expire (sauf si vous suspendez ses relances).
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email de l’entreprise"
                aria-label="Email de l’entreprise" style={{ ...input, flex: 1, minWidth: 180 }} />
              <button type="button" onClick={request} disabled={sending} style={btn('#fff', '#0369A1', '#0369A1')}>
                {sending ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
            {lastRequest && (
              <div style={{ ...small, marginTop: 8 }}>
                Dernière demande : {fmtDT(lastRequest.dernier_envoi)}{lastRequest.email ? ` à ${lastRequest.email}` : ''}
                {lastRequest.envois > 1 ? ` (${lastRequest.envois} envois)` : ''}
                {lastRequest.derniere_visite ? ` · lien ouvert le ${fmtDT(lastRequest.derniere_visite)}` : ' · lien pas encore ouvert'}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={small}>Relances automatiques :</span>
              <RelanceControls contact={contact} pause={relancePause(contact, localISO())} onChanged={onChanged} />
            </div>
            {link && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                <input readOnly value={link} aria-label="Lien de dépôt" style={{ ...input, flex: 1, fontSize: 11 }} onFocus={e => e.target.select()} />
                <button type="button" onClick={copyLink} style={btn('#334155', '#fff', '#CBD5E1')}>Copier</button>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
