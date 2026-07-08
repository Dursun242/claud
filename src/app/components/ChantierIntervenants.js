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
import EmptyState from './EmptyState'
import Modal from './Modal'
import { SB } from '../dashboards/shared'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'

const TYPE_COLOR = {
  Artisan: '#F59E0B',
  'Sous-traitant': '#8B5CF6',
  Prestataire: '#EC4899',
  Fournisseur: '#10B981',
}

export default function ChantierIntervenants({
  intervenants = [], clientContact = null,
  chantierId = null, allContacts = [], onChange, readOnly = false,
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
    <Section title="Intervenants" count={total} color="#10B981">
      {!readOnly && (
        <button
          onClick={() => setShowPicker(true)}
          style={{
            background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
            borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', marginBottom: 10,
          }}
        >
          + Ajouter un intervenant
        </button>
      )}

      {clientContact && (
        <div style={{
          background: '#fff', borderRadius: 8, padding: 12, marginBottom: 6,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          borderLeft: '3px solid #3B82F6',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{clientContact.nom}</span>
            <Badge text="Client" color="#3B82F6"/>
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {clientContact.tel} • {clientContact.email}
          </div>
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
            background: '#fff', borderRadius: 8, padding: 12, marginBottom: 6,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            borderLeft: `3px solid ${TYPE_COLOR[c.type] || '#94A3B8'}`,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.nom}</span>
                <Badge text={c.type} color={TYPE_COLOR[c.type] || '#94A3B8'}/>
                {c._source === 'os' && <Badge text="Auto (OS)" color="#94A3B8"/>}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>
                {c.specialite || c.societe || ''}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                {c.tel} • {c.email}
              </div>
            </div>
            {!readOnly && c._source === 'manuel' && (
              <button
                onClick={() => handleRemove(c)}
                aria-label={`Retirer ${c.nom}`}
                title="Retirer cet intervenant"
                style={{
                  background: 'none', border: 'none', color: '#94A3B8',
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
            width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0',
            borderRadius: 6, fontSize: 12, fontFamily: 'inherit', marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {availableContacts.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
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
                padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 6,
                background: '#fff', cursor: adding === c.id ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: adding === c.id ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#0F172A' }}>{c.nom}</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>
                  {c.type}{c.specialite ? ` • ${c.specialite}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                {adding === c.id ? '…' : '+ Ajouter'}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </Section>
  )
}
