'use client'
import { useState } from 'react'
import { SUIVI, PRIORITY_LADDER, daysLate, effectivePriority, lotKey } from '../../lib/crSuivi'
import { SUIVI_STYLE, field } from './crStyles'
import CRPhotoStrip from './CRPhotoStrip'
import CRPointNotices from './CRPointNotices'

const PRIO_LABEL = { 'En attente': 'Basse', 'En cours': 'Normale', Urgent: 'Urgente' }
const fmt = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/')
const small = { ...field, minHeight: 38, fontSize: 14, padding: '6px 8px' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label-secondary)', marginBottom: 3 }

/**
 * Un point du CR sur une ligne (tablette et ordinateur) : numéro, libellé,
 * entreprise et échéance en clair, et l'état en trois boutons (Fait / En
 * cours / À relancer). Un clic sur le libellé ouvre le détail : texte,
 * entreprise, échéance, lot, priorité, photos. Un nouveau point s'ouvre
 * directement pour être rempli (qui, quoi, pour quand).
 */
export default function CRPointRow({ row, crId, crDate, lots = [], entreprisesListId, onChange, onRemove, onMiseEnDemeure }) {
  const [open, setOpen] = useState(!!row.isNew)
  const late = row.isNew ? 0 : daysLate(row.echeance, crDate)
  const willRemind = !row.isNew && row.suivi === 'relance' && !!row.orig && row.orig.dernier_rappel_cr_id !== crId
  const nbRappels = (row.rappels || 0) + (willRemind ? 1 : 0)
  const nextPrio = effectivePriority(row, crId)
  const photos = row.photos || []
  const disabled = !!row.missing
  const ouvert = row.suivi !== 'fait'
  const detailId = `cr-point-detail-${row.key}`

  const meta = [
    row.entreprise ? { t: row.entreprise } : ouvert && { t: 'entreprise ?', tone: 'var(--orange-deep)' },
    row.echeance ? { t: `pour le ${fmt(row.echeance)}` } : ouvert && { t: 'date ?', tone: 'var(--orange-deep)' },
    late > 0 && ouvert && { t: `retard ${late} j`, tone: 'var(--red-text)', b: true },
    nbRappels > 0 && ouvert && { t: `rappel n°${nbRappels}`, tone: 'var(--red-text)', b: true },
    row.priorite === 'Urgent' && ouvert && { t: 'urgent', tone: 'var(--red-text)', b: true },
    photos.length > 0 && { t: `${photos.length} photo${photos.length > 1 ? 's' : ''}` },
    row.origineNumero && { t: `depuis CR n°${row.origineNumero}` },
    disabled && { t: 'tâche supprimée' },
  ].filter(Boolean)

  const titreField = (
    <textarea aria-label="Point" value={row.titre} disabled={disabled} rows={2} autoFocus={row.isNew && !row.titre}
      onChange={e => onChange({ titre: e.target.value })} placeholder="Ce qui doit être fait…"
      style={{ ...small, fontWeight: 600, resize: 'vertical' }} />
  )

  return (
    <div data-testid="cr-point" style={{ borderTop: '1px solid var(--separator)', padding: '10px 0', opacity: disabled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--label-secondary)', minWidth: 30, paddingTop: row.isNew ? 9 : 2 }}>
          {row.num ? `n°${row.num}` : ''}
        </span>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          {row.isNew ? titreField : (
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls={detailId}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: ouvert ? 'var(--label)' : 'var(--label-secondary)', textDecoration: ouvert ? 'none' : 'line-through' }}>
              {row.titre || 'Point sans texte'}
            </button>
          )}
          {meta.length > 0 && !(row.isNew && open) && (
            <div style={{ fontSize: 12, marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', color: 'var(--label-secondary)' }}>
              {meta.map((x, i) => (
                <span key={i}>{i ? <span aria-hidden="true">· </span> : null}<span style={{ color: x.tone, fontWeight: x.b ? 700 : 400 }}>{x.t}</span></span>
              ))}
            </div>
          )}
        </div>
        {row.isNew ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: SUIVI_STYLE.nouveau.color, paddingTop: 9 }}>Nouveau</span>
        ) : (
          <div role="radiogroup" aria-label={`État de « ${row.titre} »`}
            style={{ display: 'flex', flexShrink: 0, marginLeft: 'auto', border: '1px solid var(--separator-opaque)', borderRadius: 9, overflow: 'hidden' }}>
            {['fait', 'en_cours', 'relance'].map((k, i) => {
              const on = row.suivi === k
              const s = SUIVI_STYLE[k]
              return (
                <button key={k} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange({ suivi: k })}
                  style={{ minHeight: 40, padding: '0 12px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', border: 'none',
                    borderLeft: i ? '1px solid var(--separator-opaque)' : 'none', background: on ? s.color : '#fff', color: on ? '#fff' : 'var(--label-2)' }}>
                  {SUIVI[k]}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ marginLeft: 40 }}>
        <CRPointNotices row={row} crId={crId} disabled={disabled} onChange={onChange} onMiseEnDemeure={onMiseEnDemeure} />
        {open && (
          <div id={detailId} style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            {!row.isNew && <div style={{ gridColumn: '1 / -1' }}>{titreField}</div>}
            <label style={{ display: 'block' }}>
              <span style={lbl}>Entreprise</span>
              <input aria-label="Entreprise" value={row.entreprise} list={entreprisesListId} disabled={disabled}
                onChange={e => onChange({ entreprise: e.target.value })} placeholder="Qui ?" style={small} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={lbl}>Pour le</span>
              <input aria-label="Échéance" type="date" value={row.echeance || ''} disabled={disabled}
                onChange={e => onChange({ echeance: e.target.value })} style={small} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={lbl}>Lot</span>
              <select aria-label="Lot" value={lotKey(row.lot)} disabled={disabled}
                onChange={e => onChange({ lot: lots.find(l => l.key === e.target.value)?.lot || row.lot })} style={small}>
                {lots.map(l => <option key={l.key} value={l.key}>{l.lot}</option>)}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={lbl}>Priorité</span>
              <select aria-label="Priorité" value={PRIORITY_LADDER.includes(row.priorite) ? row.priorite : 'En cours'} disabled={disabled}
                onChange={e => onChange({ priorite: e.target.value })} style={small}>
                {PRIORITY_LADDER.map(p => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
              </select>
            </label>
            {willRemind && nextPrio !== row.priorite && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--red-text)' }}>
                Relance : priorité relevée à « {PRIO_LABEL[nextPrio]} » à l&apos;enregistrement.
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <CRPhotoStrip photos={photos} onChange={(p) => onChange({ photos: p })} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              {row.isNew && (
                <button type="button" onClick={onRemove} aria-label="Retirer ce point"
                  style={{ background: 'none', border: 'none', color: 'var(--red-text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>Retirer</button>
              )}
              <button type="button" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>OK</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
