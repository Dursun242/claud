'use client'
import { useState } from 'react'
import { SUIVI, PRIORITY_LADDER, daysLate, effectivePriority, lotKey } from '../../lib/crSuivi'
import { SUIVI_STYLE, PRIO_COLOR, field } from './crStyles'
import CRPhotoStrip from './CRPhotoStrip'

const PRIO_LABEL = { 'En attente': 'Basse', 'En cours': 'Normale', Urgent: 'Urgente' }
const small = { ...field, minHeight: 36, fontSize: 14, padding: '6px 8px' }

/**
 * Un point du CR : état (Fait / En cours / À relancer), libellé, entreprise,
 * échéance, priorité, lot, photos. Un point « À relancer » prend un rappel
 * et monte d'un cran de priorité à l'enregistrement.
 */
export default function CRPointCard({ row, crId, crDate, lots = [], entreprisesListId, onChange, onRemove, m }) {
  const [showPhotos, setShowPhotos] = useState(false)
  const st = SUIVI_STYLE[row.suivi] || SUIVI_STYLE.en_cours
  const late = row.isNew ? 0 : daysLate(row.echeance, crDate)
  const willRemind = !row.isNew && row.suivi === 'relance' && !!row.orig && row.orig.dernier_rappel_cr_id !== crId
  const nextPrio = effectivePriority(row, crId)
  const nbRappels = row.rappels + (willRemind ? 1 : 0)
  const photos = row.photos || []
  const disabled = !!row.missing

  return (
    <div data-testid="cr-point" style={{ border: `1.5px solid ${st.border}`, background: st.bg, borderRadius: 10, padding: 10, opacity: disabled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {row.num ? <span style={{ fontSize: 12, fontWeight: 800, color: '#1E3A5F', minWidth: 28 }}>n°{row.num}</span> : null}
        {row.isNew ? (
          <span style={{ fontSize: 10, fontWeight: 800, color: st.color, background: '#fff', border: `1px solid ${st.border}`, borderRadius: 5, padding: '3px 7px' }}>NOUVEAU</span>
        ) : (
          <div role="radiogroup" aria-label={`État de « ${row.titre} »`} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['fait', 'en_cours', 'relance'].map(k => {
              const on = row.suivi === k
              const s = SUIVI_STYLE[k]
              return (
                <button key={k} type="button" role="radio" aria-checked={on} disabled={disabled}
                  onClick={() => onChange({ suivi: k })}
                  style={{
                    padding: m ? '8px 10px' : '6px 10px', minHeight: m ? 40 : 32, borderRadius: 8, fontSize: 12, fontWeight: 700,
                    fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
                    border: `1.5px solid ${on ? s.color : '#E2E8F0'}`,
                    background: on ? '#fff' : 'rgba(255,255,255,0.6)', color: on ? s.color : '#94A3B8',
                  }}>{k === 'fait' ? '✓ ' : k === 'relance' ? '🔔 ' : ''}{SUIVI[k]}</button>
              )
            })}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {row.origineNumero ? <span style={{ fontSize: 10, color: '#64748B' }}>depuis CR n°{row.origineNumero}</span> : null}
          {late > 0 && row.suivi !== 'fait' && <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C' }}>retard {late} j</span>}
          {nbRappels > 0 && row.suivi !== 'fait' && <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C' }}>rappel n°{nbRappels}</span>}
          {disabled && <span style={{ fontSize: 10, color: '#64748B' }}>tâche supprimée</span>}
          <button type="button" onClick={() => setShowPhotos(v => !v)} aria-expanded={showPhotos}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1E3A5F', fontFamily: 'inherit', padding: '2px 4px' }}>
            📷 {photos.length || ''}
          </button>
          {row.isNew && (
            <button type="button" onClick={onRemove} aria-label="Retirer ce point"
              style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : '2.6fr 1.4fr 1fr 0.9fr 1fr', gap: 6, marginTop: 8 }}>
        <textarea aria-label="Point" value={row.titre} disabled={disabled} rows={m ? 2 : 1}
          onChange={e => onChange({ titre: e.target.value })} placeholder="Point à traiter…"
          style={{ ...small, gridColumn: m ? '1 / -1' : 'auto', fontWeight: 600, resize: 'vertical', minHeight: 36 }} />
        <input aria-label="Entreprise" value={row.entreprise} list={entreprisesListId} disabled={disabled}
          onChange={e => onChange({ entreprise: e.target.value })} placeholder="Entreprise"
          style={{ ...small, gridColumn: m ? '1 / -1' : 'auto' }} />
        <input aria-label="Échéance" type="date" value={row.echeance || ''} disabled={disabled}
          onChange={e => onChange({ echeance: e.target.value })} style={small} />
        <select aria-label="Priorité" value={PRIORITY_LADDER.includes(row.priorite) ? row.priorite : 'En cours'} disabled={disabled}
          onChange={e => onChange({ priorite: e.target.value })}
          style={{ ...small, color: PRIO_COLOR[row.priorite] || '#0F172A', fontWeight: 600 }}>
          {PRIORITY_LADDER.map(p => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
        </select>
        <select aria-label="Lot" value={lotKey(row.lot)} disabled={disabled}
          onChange={e => onChange({ lot: lots.find(l => l.key === e.target.value)?.lot || row.lot })}
          style={{ ...small, gridColumn: m ? '1 / -1' : 'auto' }}>
          {lots.map(l => <option key={l.key} value={l.key}>{l.lot}</option>)}
        </select>
      </div>
      {willRemind && nextPrio !== row.priorite && (
        <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6 }}>
          Relance : priorité relevée à « {PRIO_LABEL[nextPrio]} » à l&apos;enregistrement.
        </div>
      )}
      {(showPhotos || photos.length > 0) && (
        <div style={{ marginTop: 8 }}>
          <CRPhotoStrip photos={photos} onChange={(p) => onChange({ photos: p })} />
        </div>
      )}
    </div>
  )
}
