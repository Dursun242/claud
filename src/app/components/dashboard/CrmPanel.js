'use client'
import { useState } from 'react'
import { fmtMoney } from '../../dashboards/shared'

const KIND = {
  chaud:        { emoji: '🔥', color: '#DC2626', label: 'Client intéressé' },
  signature:    { emoji: '✍️', color: '#7C3AED', label: 'Signature' },
  expire:       { emoji: '⏳', color: '#D97706', label: 'Expiration' },
  sans_reponse: { emoji: '📭', color: '#B45309', label: 'Sans réponse' },
  brouillon:    { emoji: '📝', color: '#64748B', label: 'Brouillon' },
  dormante:     { emoji: '💤', color: '#64748B', label: 'Affaire dormante' },
}
const COLLAPSED = 5

/**
 * Bloc « Commercial » du tableau de bord : chiffres clés du CRM + signaux
 * à saisir (lib/crmInsights). Chaque ligne ouvre l'affaire dans le CRM.
 */
export default function CrmPanel({ insights, nbOverdue = 0, onOpen, m }) {
  const [expanded, setExpanded] = useState(false)
  const { kpis, items } = insights
  const shown = expanded ? items : items.slice(0, COLLAPSED)
  const tiles = [
    { label: 'Pipeline actif', value: fmtMoney(kpis.pipelineHT), sub: `${kpis.affairesActives} affaire${kpis.affairesActives > 1 ? 's' : ''} · pondéré ${fmtMoney(kpis.pondereHT)}`, color: '#1E3A5F' },
    { label: 'Devis en attente', value: String(kpis.devisEnAttente), sub: `${fmtMoney(kpis.devisEnAttenteHT)} HT à signer`, color: '#D97706' },
    { label: 'Signés (30 j)', value: String(kpis.signes30j), sub: `${fmtMoney(kpis.signes30jHT)} HT`, color: '#047857' },
    { label: 'Taux de signature', value: kpis.tauxSignature == null ? '—' : `${kpis.tauxSignature} %`, sub: '6 derniers mois', color: '#2563EB' },
  ]

  return (
    <section aria-labelledby="crm-panel-title" style={{
      background: '#fff', borderRadius: 14, padding: m ? 14 : 18,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="crm-panel-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>🎯 Commercial</h2>
          {nbOverdue > 0 && (
            <button type="button" onClick={() => onOpen('crm', 'relances')}
              style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {nbOverdue} relance{nbOverdue > 1 ? 's' : ''} en retard
            </button>
          )}
        </div>
        <button type="button" onClick={() => onOpen('crm')} style={{
          fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
        }}>Ouvrir le CRM →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, marginBottom: items.length ? 14 : 0 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.label}</div>
            <div style={{ fontSize: m ? 17 : 19, fontWeight: 800, color: t.color, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            À saisir · {items.length}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map((it, i) => {
              const k = KIND[it.kind] || KIND.dormante
              return (
                <li key={`${it.kind}-${it.devisId || it.oppId}-${i}`}>
                  <button type="button" onClick={() => onOpen('crm', it.oppId || null)}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 10, textAlign: 'left',
                      background: '#fff', border: '1px solid #E2E8F0', borderLeft: `3px solid ${k.color}`, borderRadius: 8,
                      padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <span aria-hidden="true" style={{ fontSize: 16 }}>{k.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{it.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[it.sub, it.hint].filter(Boolean).join(' — ')}
                      </span>
                    </span>
                    {it.montant > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>{fmtMoney(it.montant)}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {items.length > COLLAPSED && (
            <button type="button" onClick={() => setExpanded(v => !v)} style={{
              marginTop: 8, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
            }}>{expanded ? 'Voir moins' : items.length - COLLAPSED === 1 ? 'Voir le dernier' : `Voir les ${items.length - COLLAPSED} autres`}</button>
          )}
        </>
      )}
    </section>
  )
}
