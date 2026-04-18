'use client'

// ═══════════════════════════════════════════════════════════════
// ChantierIntervenants — liste en lecture seule des intervenants
// d'un chantier (client + artisans dérivés des OS).
// ═══════════════════════════════════════════════════════════════

import Badge from './Badge'
import Section from './Section'

const TYPE_COLOR = {
  Artisan: '#F59E0B',
  'Sous-traitant': '#8B5CF6',
  Prestataire: '#EC4899',
  Fournisseur: '#10B981',
}

export default function ChantierIntervenants({ intervenants = [], clientContact = null }) {
  const total = intervenants.length + (clientContact ? 1 : 0)

  return (
    <Section title="Intervenants" count={total} color="#10B981">
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
        ? <p style={{ color: '#94A3B8', fontSize: 12 }}>Aucun intervenant lié via les OS</p>
        : intervenants.map((c) => (
          <div key={c.id} style={{
            background: '#fff', borderRadius: 8, padding: 12, marginBottom: 6,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            borderLeft: `3px solid ${TYPE_COLOR[c.type] || '#94A3B8'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{c.nom}</span>
              <Badge text={c.type} color={TYPE_COLOR[c.type] || '#94A3B8'}/>
            </div>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              {c.specialite || c.societe || ''}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              {c.tel} • {c.email}
            </div>
          </div>
        ))
      }
    </Section>
  )
}
