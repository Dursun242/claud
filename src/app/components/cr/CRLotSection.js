'use client'
import { GENERAL } from '../../lib/crSuivi'
import { card, field, label, ghostBtn } from './crStyles'
import CRPointCard from './CRPointCard'
import CRPhotoStrip from './CRPhotoStrip'
import MicButton from './MicButton'

/**
 * Section d'un lot : entreprise, avancement (prévu au planning / précédent),
 * observations (dictables), photos, points du lot.
 */
export default function CRLotSection({
  section, rows, crId, crDate, lots, entreprisesListId, dictation, m,
  onSection, onRow, onRemoveRow, onAddRow,
}) {
  const isGeneral = section.lot === GENERAL
  const av = section.avancement === '' || section.avancement == null ? null : Number(section.avancement)
  const ecart = av != null && section.prevu != null ? av - section.prevu : null
  const micId = `obs:${section.key}`
  const relances = rows.filter(r => r.suivi === 'relance').length

  return (
    <section id={`cr-section-${section.key}`} aria-label={section.lot} style={{ ...card, scrollMarginTop: 120 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: '#0F172A' }}>{section.lot}</h3>
        <span style={{ fontSize: 12, color: '#64748B' }}>
          {rows.length} point{rows.length > 1 ? 's' : ''}{relances ? ` · ` : ''}
          {relances ? <b style={{ color: '#B91C1C' }}>{relances} à relancer</b> : null}
        </span>
      </div>

      {!isGeneral && (
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1.2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <span style={label}>Entreprise</span>
            <input aria-label={`Entreprise du lot ${section.lot}`} value={section.entreprise || ''} list={entreprisesListId}
              onChange={e => onSection({ entreprise: e.target.value })} placeholder="Entreprise titulaire" style={field} />
          </div>
          <div>
            <span style={label}>Avancement {av != null ? `· ${av} %` : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="range" min="0" max="100" step="5" aria-label={`Avancement du lot ${section.lot}`}
                value={av ?? 0} onChange={e => onSection({ avancement: Number(e.target.value) })}
                style={{ flex: 1, accentColor: '#1E3A5F', minHeight: 32 }} />
              <input type="number" min="0" max="100" aria-label={`Avancement du lot ${section.lot} en %`}
                value={av ?? ''} onChange={e => onSection({ avancement: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
                style={{ ...field, width: 72, minHeight: 36 }} />
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {section.avancement_prec != null && <span>CR précédent : {section.avancement_prec} %</span>}
              {section.prevu != null && <span>Prévu au planning : {section.prevu} %</span>}
              {ecart != null && ecart !== 0 && (
                <b style={{ color: ecart < 0 ? '#B91C1C' : '#047857' }}>{ecart > 0 ? '+' : ''}{ecart} pts</b>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={label}>{isGeneral ? 'Observations générales (planning, sécurité, administratif…)' : 'Observations'}</span>
          {dictation && (
            <MicButton active={dictation.target === micId}
              onClick={() => dictation.toggle(micId, (t) => onSection(s => ({ observations: s.observations ? `${s.observations.trimEnd()} ${t}` : t })))} />
          )}
        </div>
        <textarea aria-label={`Observations ${section.lot}`} value={section.observations || ''}
          onChange={e => onSection({ observations: e.target.value })} rows={m ? 4 : 3}
          placeholder={isGeneral ? 'Planning, sécurité, propreté, administratif…' : 'Constats, avancement, remarques…'}
          style={{ ...field, resize: 'vertical' }} />
        {dictation?.target === micId && dictation.interim && (
          <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', marginTop: 3 }}>{dictation.interim}…</div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={label}>Photos du lot</span>
        <CRPhotoStrip photos={section.photos || []} onChange={(p) => onSection({ photos: p })} />
      </div>

      <span style={label}>Points</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <CRPointCard key={r.key} row={r} crId={crId} crDate={crDate} lots={lots} m={m}
            entreprisesListId={entreprisesListId}
            onChange={(p) => onRow(r.key, p)} onRemove={() => onRemoveRow(r.key)} />
        ))}
      </div>
      <button type="button" onClick={onAddRow} style={{ ...ghostBtn('#7C3AED'), width: '100%', marginTop: 8, borderStyle: 'dashed' }}>
        + Nouveau point {isGeneral ? '' : `— ${section.lot}`}
      </button>
    </section>
  )
}
