import { fmtMoney, fmtDate } from '../../dashboards/shared'
import { EmptyState } from '../index'
import { ETAPE_COLORS } from '../../lib/crm'

const KIND = {
  won: {
    title: 'Affaires gagnées', empty: 'Aucune affaire gagnée', emptyDesc: 'Les affaires signées apparaîtront ici.',
    icon: '🏆', color: ETAPE_COLORS['Gagné'], bg: '#ECFDF5', text: '#047857',
  },
  lost: {
    title: 'Affaires perdues', empty: 'Aucune affaire perdue', emptyDesc: 'Les affaires perdues apparaîtront ici, avec leur motif.',
    icon: '✖', color: ETAPE_COLORS['Perdu'], bg: '#FEF2F2', text: '#B91C1C',
  },
}

const closedOn = (o) => String(o.date_cloture || o.updated_at || '').slice(0, 10)

/**
 * Vues « Gagnées » et « Perdues » : affaires closes, les plus récentes
 * d'abord, avec le total ; pour les perdues, les motifs les plus fréquents.
 */
export default function CrmClosedList({ kind = 'won', list, contactsById, chantiers, onOpen }) {
  const k = KIND[kind] || KIND.won
  const sorted = [...list].sort((a, b) => closedOn(b).localeCompare(closedOn(a)))
  const total = list.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
  const year = String(new Date().getFullYear())
  const thisYear = list.filter(o => closedOn(o).startsWith(year))
  const totalYear = thisYear.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
  const motifs = kind === 'lost'
    ? Object.entries(list.reduce((acc, o) => {
      const mo = String(o.motif_perte || '').trim() || 'Sans motif'
      acc[mo] = (acc[mo] || 0) + 1
      return acc
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : []

  if (!list.length) return <EmptyState icon={k.icon} title={k.empty} description={k.emptyDesc} />

  return (
    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div style={{ background: k.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: k.text }}>{k.icon} {k.title}</span>
        <span style={{ fontSize: 12, color: k.text }}>
          {list.length} affaire{list.length > 1 ? 's' : ''} · {fmtMoney(total)}
        </span>
        <span style={{ fontSize: 12, color: k.text }}>
          dont {year} : {thisYear.length} · {fmtMoney(totalYear)}
        </span>
        {motifs.length > 0 && (
          <span style={{ fontSize: 11, color: '#64748B', width: '100%' }}>
            Motifs : {motifs.map(([mo, n]) => `${mo} (${n})`).join(' · ')}
          </span>
        )}
      </div>
      {sorted.map(o => {
        const c = contactsById.get(o.contact_id)
        const ch = chantiers.find(x => x.id === o.chantier_id)
        return (
          <button type="button" key={o.id} onClick={() => onOpen(o.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, textAlign: 'left',
            padding: '10px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.05)', cursor: 'pointer', fontFamily: 'inherit',
            border: 'none', borderLeft: `3px solid ${k.color}`, minWidth: 0, width: '100%',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
              <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c?.nom || '—'}{o.date_cloture ? ` · le ${fmtDate(o.date_cloture)}` : ''}
                {kind === 'lost' && o.motif_perte ? ` · ${o.motif_perte}` : ''}
                {kind === 'won' && ch ? ` · chantier ${ch.nom}` : ''}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: k.text, whiteSpace: 'nowrap' }}>{fmtMoney(o.montant_estime)}</span>
          </button>
        )
      })}
    </div>
  )
}
