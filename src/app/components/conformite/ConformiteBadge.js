'use client'
import { STATUS_META, DOC_META, DOC_KINDS, problemSummary } from '../../lib/conformite'

/**
 * Pastille « Documents » d'une entreprise (Kbis, décennale, fiscale,
 * URSSAF). Cliquable si `onClick` est fourni.
 */
export default function ConformiteBadge({ compliance, onClick, compact = false }) {
  if (!compliance) return null
  const meta = STATUS_META[compliance.status]
  const nbMissing = compliance.problems.filter(p => p.status === 'manquant').length
  const text = compliance.status === 'ok' ? 'Documents à jour'
    : nbMissing === DOC_KINDS.length ? 'Aucun document'
      : compact ? meta.label
        : compliance.problems.length === 1 ? `${DOC_META[compliance.problems[0].kind].label} : ${STATUS_META[compliance.problems[0].status].label.toLowerCase()}`
          : `Documents : ${meta.label.toLowerCase()}`
  const title = compliance.status === 'ok' ? 'Kbis, décennale, attestations fiscale et URSSAF à jour, RIB reçu' : problemSummary(compliance)
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
    borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 700,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  }
  const content = <>📄 {text}</>
  return onClick
    ? <button type="button" onClick={onClick} title={title} style={{ ...style, cursor: 'pointer' }}>{content}</button>
    : <span title={title} style={style}>{content}</span>
}
