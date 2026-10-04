'use client'
import { LEGAL_META } from '../../lib/legalCheck'

/**
 * Pastille « situation légale » (annuaire + BODACC). Rien si l'entreprise
 * est active ou non vérifiée, sauf `always`.
 */
export default function LegalBadge({ check, always = false, onClick }) {
  if (!check || (!always && !['alerte', 'critique'].includes(check.statut))) return null
  const meta = LEGAL_META[check.statut] || LEGAL_META.inconnu
  const text = check.statut === 'critique' ? '⚠ Fermée / liquidation' : check.statut === 'alerte' ? '⚠ Procédure collective' : meta.label
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 4, background: meta.bg, color: meta.color,
    border: `1px solid ${meta.border}`, borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 800,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
  return onClick
    ? <button type="button" onClick={onClick} title={check.libelle} style={{ ...style, cursor: 'pointer' }}>{text}</button>
    : <span title={check.libelle} style={style}>{text}</span>
}
