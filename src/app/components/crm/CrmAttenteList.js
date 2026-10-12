import { fmtMoney } from '../../dashboards/shared'
import { EmptyState } from '../index'
import { attenteList } from '../../lib/crm'
import { localISO } from '../../lib/today'
import { repriseEnvoyee } from '../../lib/crmReprise'

/** Date de reprise avec l'année (la reprise peut être dans un an) : « 12 oct. 2027 ». */
export const fmtReprise = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Quand reprendre contact : rouge si la date est passée ou atteinte,
// orange dans le mois, sinon la date.
function reprise(n, date) {
  if (n == null) return { text: 'Date de reprise à fixer', color: 'var(--label-secondary)' }
  if (n < 0) return { text: `À reprendre depuis ${-n} j`, color: 'var(--red-text)' }
  if (n === 0) return { text: "À reprendre aujourd'hui", color: 'var(--red-text)' }
  if (n <= 30) return { text: `Reprise dans ${n} j`, color: 'var(--orange-text)' }
  return { text: `Reprise le ${fmtReprise(date)}`, color: 'var(--indigo-text)' }
}

/**
 * Vue « En attente » : affaires dont le client a mis le projet en pause
 * (reporté, financement…). Ni gagnées ni perdues : on les garde pour
 * reprendre contact à la date prévue. Les plus proches de la reprise d'abord.
 */
export default function CrmAttenteList({ list, contactsById, onOpen, today = localISO() }) {
  const sorted = attenteList(list, today)
  const total = list.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
  const dues = sorted.filter(o => o.joursAvantReprise != null && o.joursAvantReprise <= 0 && !repriseEnvoyee(o)).length

  if (!list.length) {
    return (
      <EmptyState icon="⏸" title="Aucune affaire en attente"
        description="Quand un client met son projet en pause (reporté, financement, permis…), mets l'affaire en attente depuis sa fiche : elle sort du pipeline et un rappel revient à la date choisie." />
    )
  }

  return (
    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div style={{ background: 'var(--indigo-tint)', borderRadius: 10, padding: '10px 14px', marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--indigo-text)' }}>⏸ Affaires en attente</span>
        <span style={{ fontSize: 12, color: 'var(--indigo-text)' }}>
          {list.length} affaire{list.length > 1 ? 's' : ''} · {fmtMoney(total)}
        </span>
        {dues > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red-text)' }}>
            {dues} à reprendre maintenant
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--label-secondary)', width: '100%' }}>
          Projets mis en pause par le client : ni gagnés, ni perdus. Reprends contact à la date prévue, ou dès que le client revient.
        </span>
      </div>
      {sorted.map(o => {
        const c = contactsById.get(o.contact_id)
        const r = repriseEnvoyee(o)
          ? { text: `Mail de reprise envoyé le ${fmtReprise(o.reprise_envoyee_le)}, en attente de réponse`, color: 'var(--orange-text)' }
          : reprise(o.joursAvantReprise, o.date_reprise)
        return (
          <button type="button" key={o.id} onClick={() => onOpen(o.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, textAlign: 'left',
            padding: '10px 14px', minHeight: 56, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid var(--separator)', minWidth: 0, width: '100%',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
              <div style={{ fontSize: 11, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c?.nom || '—'}{o.motif_attente ? ` · ${o.motif_attente}` : ''}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: r.color, marginTop: 2 }}>{r.text}</div>
            </div>
            {Number(o.montant_estime) > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--label-2)', whiteSpace: 'nowrap' }}>{fmtMoney(o.montant_estime)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
