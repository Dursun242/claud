'use client'

// ═══════════════════════════════════════════════════════════════
// ChantierBudgetCard — KPIs budget d'un chantier + gauge de progression.
// ═══════════════════════════════════════════════════════════════
//
// Prend directement l'objet `finances` issu de computeChantierFinances
// (voir lib/chantierFinances.js). Rend la grille 4 KPIs (Budget / Engagé /
// Reste ou Dépassement / Avancement) + une barre de progression + deux
// lignes optionnelles (brouillons, alerte dépassement).

import { PBar, fmtMoney } from '../dashboards/shared'

export default function ChantierBudgetCard({ finances, m }) {
  if (!finances) return null

  const ratio = finances.ratio ?? 0
  const budgetColor =
    finances.depassement > 0 ? '#EF4444'
      : ratio >= 95 ? '#F59E0B'
      : ratio >= 70 ? '#3B82F6'
      : '#10B981'

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: m ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
        gap: 12, marginBottom: 12,
      }}>
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Budget</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
            {fmtMoney(finances.budget)}
          </div>
        </div>
        <div
          style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}
          title={`${finances.engageCount} OS engagés (hors brouillon/annulé)`}
        >
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Engagé (OS)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>
            {fmtMoney(finances.engageMontant)}
          </div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
            {finances.engageCount} OS · dont {finances.realiseCount} terminé{finances.realiseCount > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>
            {finances.depassement > 0 ? 'Dépassement' : 'Reste à engager'}
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: finances.depassement > 0 ? '#EF4444' : '#0F172A',
          }}>
            {finances.depassement > 0
              ? '+' + fmtMoney(finances.depassement)
              : fmtMoney(finances.resteEngager)}
          </div>
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Avancement</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>{ratio}%</div>
        </div>
      </div>
      <PBar
        value={finances.engageMontant}
        max={finances.budget || finances.engageMontant || 1}
        color={budgetColor}
        h={10}
      />
      {finances.brouillonMontant > 0 && (
        <div style={{
          marginTop: 8, fontSize: 11, color: '#64748B',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8' }} />
          {finances.brouillonCount} OS en brouillon : {fmtMoney(finances.brouillonMontant)} (non engagés)
        </div>
      )}
      {finances.depassement > 0 && (
        <div style={{
          marginTop: 8, fontSize: 12, color: '#B91C1C',
          background: '#FEF2F2', border: '1px solid #FECACA',
          borderRadius: 6, padding: '8px 10px', fontWeight: 600,
        }}>
          ⚠ Budget dépassé de {fmtMoney(finances.depassement)} — revoir le budget ou les OS
        </div>
      )}
    </div>
  )
}
