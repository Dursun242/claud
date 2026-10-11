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
import { EMOJI } from '../lib/emoji'

export default function ChantierBudgetCard({ finances, m }) {
  if (!finances) return null

  const ratio = finances.ratio ?? 0
  // Couleur seulement quand il y a quelque chose à signaler : dépassement
  // (rouge) ou budget presque entièrement engagé (ambre). Sinon marine.
  const alertColor =
    finances.depassement > 0 ? '#D70015'
      : ratio >= 95 ? '#C93400'
      : null
  const budgetColor = alertColor || '#1C1C1E'
  const barColor = finances.depassement > 0 ? '#D70015' : ratio >= 95 ? '#FF9500' : '#0071E3'
  const label = { fontSize: 11, color: '#6E6E73', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: m ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
        gap: 12, marginBottom: 12,
      }}>
        <div style={{ background: '#F5F5F7', borderRadius: 8, padding: 10 }}>
          <div style={label}>Budget</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1C1E' }}>
            {fmtMoney(finances.budget)}
          </div>
        </div>
        <div
          style={{ background: '#F5F5F7', borderRadius: 8, padding: 10 }}
          title={`${finances.engageCount} OS engagés (hors brouillon/annulé)`}
        >
          <div style={label}>Engagé (OS)</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>
            {fmtMoney(finances.engageMontant)}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>
            {finances.engageCount} OS · dont {finances.realiseCount} terminé{finances.realiseCount > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ background: '#F5F5F7', borderRadius: 8, padding: 10 }}>
          <div style={label}>
            {finances.depassement > 0 ? 'Dépassement' : 'Reste à engager'}
          </div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: finances.depassement > 0 ? '#D70015' : '#1C1C1E',
          }}>
            {finances.depassement > 0
              ? '+' + fmtMoney(finances.depassement)
              : fmtMoney(finances.resteEngager)}
          </div>
        </div>
        <div style={{ background: '#F5F5F7', borderRadius: 8, padding: 10 }}>
          <div style={label} title="Part du budget engagée dans les OS">Budget engagé</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: budgetColor }}>{ratio}%</div>
        </div>
      </div>
      <PBar
        value={finances.engageMontant}
        max={finances.budget || finances.engageMontant || 1}
        color={barColor}
        h={8}
      />
      {finances.brouillonMontant > 0 && (
        <div style={{
          marginTop: 8, fontSize: 12, color: '#6E6E73',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8E8E93' }} />
          {finances.brouillonCount} OS en brouillon : {fmtMoney(finances.brouillonMontant)} (non engagés)
        </div>
      )}
      {finances.depassement > 0 && (
        <div style={{
          marginTop: 8, fontSize: 12, color: '#D70015',
          background: '#FFF0EF', border: '1px solid #FFC9C6',
          borderRadius: 6, padding: '8px 10px', fontWeight: 600,
        }}>
          {EMOJI.alerte} Budget dépassé de {fmtMoney(finances.depassement)} — revoir le budget ou les OS
        </div>
      )}
    </div>
  )
}
