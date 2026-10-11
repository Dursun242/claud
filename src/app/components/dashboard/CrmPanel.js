'use client'
import { useState } from 'react'
import { fmtMoney } from '../../dashboards/shared'
import Badge from '../Badge'

// Signal → étiquette ; couleur seulement quand elle a un sens (à saisir
// vite : bleu ; échéance proche : ambre ; le reste : neutre)
const KIND = {
  chaud:        { color: '#3B82F6', label: 'Client intéressé' },
  signature:    { color: '#8B5CF6', label: 'Signature' },
  expire:       { color: '#F59E0B', label: 'Expiration' },
  sans_reponse: { color: '#64748B', label: 'Sans réponse' },
  brouillon:    { color: '#64748B', label: 'Brouillon' },
  dormante:     { color: '#64748B', label: 'Affaire dormante' },
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
    { label: 'Pipeline actif', value: fmtMoney(kpis.pipelineHT), sub: `${kpis.affairesActives} affaire${kpis.affairesActives > 1 ? 's' : ''} · pondéré ${fmtMoney(kpis.pondereHT)}` },
    { label: 'Devis en attente', value: String(kpis.devisEnAttente), sub: `${fmtMoney(kpis.devisEnAttenteHT)} HT à signer` },
    { label: 'Signés (30 j)', value: String(kpis.signes30j), sub: `${fmtMoney(kpis.signes30jHT)} HT` },
    { label: 'Taux de signature', value: kpis.tauxSignature == null ? '—' : `${kpis.tauxSignature} %`, sub: '6 derniers mois' },
  ]

  return (
    <section aria-labelledby="crm-panel-title" style={{
      background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
      border: '1px solid #E2E8F0',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="crm-panel-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Commercial</h2>
          {nbOverdue > 0 && (
            <button type="button" onClick={() => onOpen('crm', 'relances')}
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 999, padding: '2px 10px', minHeight: 28, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {nbOverdue} relance{nbOverdue > 1 ? 's' : ''} en retard
            </button>
          )}
        </div>
        <button type="button" onClick={() => onOpen('crm')} style={{
          fontSize: 13, color: '#1D4ED8', background: 'none', border: 'none', minHeight: 36, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
        }}>Ouvrir le CRM →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: m ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, marginBottom: items.length ? 14 : 0 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</div>
            <div style={{ fontSize: m ? 17 : 19, fontWeight: 700, color: '#0F172A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            À saisir · {items.length}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map((it, i) => {
              const k = KIND[it.kind] || KIND.dormante
              return (
                <li key={`${it.kind}-${it.devisId || it.oppId}-${i}`}>
                  <button type="button" onClick={() => onOpen('crm', it.oppId || null)}
                    className="u-press u-press--row"
                    style={{
                      display: 'flex', width: '100%', minHeight: 44, alignItems: 'center', gap: 10, textAlign: 'left',
                      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
                      padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                        {it.title}<Badge text={k.label} color={k.color}/>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              marginTop: 8, fontSize: 13, color: '#1D4ED8', background: 'none', border: 'none', minHeight: 36, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
            }}>{expanded ? 'Voir moins' : items.length - COLLAPSED === 1 ? 'Voir le dernier' : `Voir les ${items.length - COLLAPSED} autres`}</button>
          )}
        </>
      )}
    </section>
  )
}
