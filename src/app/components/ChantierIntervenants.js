'use client'

// ═══════════════════════════════════════════════════════════════
// ChantierIntervenants — liste des intervenants d'un chantier
// (client + artisans dérivés des OS + intervenants ajoutés manuellement
// depuis les contacts). Permet d'ajouter/retirer un intervenant manuel
// pour qu'il apparaisse ensuite dans la sélection des PV de réception.
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import Badge from './Badge'
import Section from './Section'
import { EMOJI } from '../lib/emoji'
import EmptyState from './EmptyState'
import Modal from './Modal'
import { SB, Icon, I, btnAdd } from '../dashboards/shared'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import ConformiteBadge from './conformite/ConformiteBadge'
import { isSubject, complianceOf } from '../lib/conformite'

// Le type d'intervenant est une catégorie, pas un statut : badge neutre
// (DESIGN.md, « Meaning-Only Rule »).
const TYPE_BADGE = '#6E6E73'

// Téléphone et e-mail cliquables (appel / mail d'un toucher sur chantier)
function ContactLinks({ tel, email }) {
  if (!tel && !email) return null
  const link = {
    display: 'inline-flex', alignItems: 'center', minHeight: 32,
    fontSize: 13, color: '#0066CC', textDecoration: 'none', fontWeight: 500,
    overflowWrap: 'anywhere',
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, marginTop: 2 }}>
      {tel && <a href={`tel:${String(tel).replace(/[^\d+]/g, '')}`} style={link}>{tel}</a>}
      {email && <a href={`mailto:${email}`} style={link}>{email}</a>}
    </div>
  )
}

export default function ChantierIntervenants({
  intervenants = [], clientContact = null,
  chantierId = null, allContacts = [], onChange, readOnly = false,
  conformite = null, // useConformite() : pastille « Documents » des entreprises
}) {
  const total = intervenants.length + (clientContact ? 1 : 0)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(null) // id du contact en cours d'ajout
  const { addToast } = useToast()
  const confirm = useConfirm()

  const linkedIds = useMemo(
    () => new Set(intervenants.map(i => i.id).filter(Boolean)),
    [intervenants]
  )

  const availableContacts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allContacts
      .filter(c => !linkedIds.has(c.id))
      .filter(c => !term || c.nom?.toLowerCase().includes(term) || c.societe?.toLowerCase().includes(term))
  }, [allContacts, linkedIds, search])

  const handleAdd = async (contact) => {
    if (!chantierId) return
    setAdding(contact.id)
    try {
      await SB.addContactChantier(contact.id, chantierId)
      addToast(`${contact.nom} ajouté aux intervenants`, 'success')
      setShowPicker(false)
      setSearch('')
      onChange?.()
    } catch (err) {
      addToast('Erreur ajout intervenant : ' + err.message, 'error')
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (intervenant) => {
    const ok = await confirm({
      title: `Retirer ${intervenant.nom} ?`,
      message: "Cet intervenant ne sera plus proposé lors de la création des PV de réception.",
      confirmLabel: 'Retirer',
      danger: true,
    })
    if (!ok) return
    try {
      await SB.removeContactChantier(intervenant._linkId)
      addToast('Intervenant retiré', 'success')
      onChange?.()
    } catch (err) {
      addToast('Erreur suppression : ' + err.message, 'error')
    }
  }

  return (
    <Section title="Intervenants" count={total} emoji={EMOJI.intervenants}>
      {!readOnly && (
        <button
          onClick={() => setShowPicker(true)}
          className="u-btn"
          style={{ ...btnAdd, marginBottom: 10 }}
        >
          <Icon d={I.plus} size={16}/>Ajouter un intervenant
        </button>
      )}

      {clientContact && (
        <div style={{
          background: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
          border: '1px solid #E5E5EA',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{clientContact.nom}</span>
            <Badge text="Client" color="#007AFF"/>
          </div>
          <ContactLinks tel={clientContact.tel} email={clientContact.email}/>
        </div>
      )}

      {intervenants.length === 0 && !clientContact
        ? <EmptyState
            compact
            icon="👷"
            title="Aucun intervenant lié"
            description="Ajoutez un intervenant depuis vos contacts, ou il apparaîtra automatiquement dès qu'un OS lui sera rattaché."
          />
        : intervenants.map((c) => (
          <div key={c.id} style={{
            background: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
            border: '1px solid #E5E5EA',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.nom}</span>
                <Badge text={c.type} color={TYPE_BADGE}/>
                {c._source === 'os' && <Badge text="Auto (OS)" color="#8E8E93"/>}
                {conformite?.ready && isSubject(c) && (
                  <ConformiteBadge compact compliance={complianceOf(conformite.byContact, c.id, conformite.today)}/>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#6E6E73' }}>
                {c.specialite || c.societe || ''}
              </div>
              <ContactLinks tel={c.tel} email={c.email_travaux || c.email}/>
            </div>
            {!readOnly && c._source === 'manuel' && (
              <button
                onClick={() => handleRemove(c)}
                aria-label={`Retirer ${c.nom}`}
                title="Retirer cet intervenant"
                style={{
                  background: 'none', border: 'none', color: '#6E6E73',
                  fontSize: 16, cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))
      }

      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Ajouter un intervenant">
        <input
          type="text"
          placeholder="Rechercher un contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', border: '1px solid #E5E5EA',
            borderRadius: 6, fontSize: 12, fontFamily: 'inherit', marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {availableContacts.length === 0 ? (
            <p style={{ color: '#6E6E73', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              Aucun contact disponible. Tous vos contacts sont déjà rattachés, ou aucun ne correspond à la recherche.
            </p>
          ) : availableContacts.map(c => (
            <button
              key={c.id}
              onClick={() => handleAdd(c)}
              disabled={adding === c.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', textAlign: 'left', gap: 10,
                padding: '10px 12px', border: '1px solid #E5E5EA', borderRadius: 6,
                background: '#fff', cursor: adding === c.id ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: adding === c.id ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#1C1C1E' }}>{c.nom}</div>
                <div style={{ fontSize: 11, color: '#6E6E73' }}>
                  {c.type}{c.specialite ? ` • ${c.specialite}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#1E7B34', flexShrink: 0 }}>
                {adding === c.id ? '…' : '+ Ajouter'}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </Section>
  )
}
