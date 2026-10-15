'use client'
import { useState } from 'react'
import { GENERAL, daysLate } from '../../lib/crSuivi'
import { card, field } from './crStyles'
import CRPointRow from './CRPointRow'
import CRPhotoStrip from './CRPhotoStrip'
import MicButton from './MicButton'

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--label-secondary)', marginBottom: 3 }
const linkBtn = { background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }

/**
 * Un lot du CR (tablette et ordinateur), replié sur une ligne : nom,
 * entreprise, avancement, points, ce qui est en retard ou à relancer.
 * Déplié : entreprise et avancement, points en lignes simples, puis
 * observations et photos (ouvertes seulement si remplies ou demandées).
 */
export default function CRLotPanel({
  section, rows, open, onToggle, crId, crDate, lots, entreprisesListId, dictation,
  onSection, onRow, onRemoveRow, onAddRow, onMiseEnDemeure,
}) {
  const isGeneral = section.lot === GENERAL
  const micId = `obs:${section.key}`
  const [showObs, setShowObs] = useState(false)
  const [showPhotos, setShowPhotos] = useState(false)
  const obsVisible = showObs || !!String(section.observations || '').trim() || dictation?.target === micId
  const photos = section.photos || []
  const av = section.avancement === '' || section.avancement == null ? null : Number(section.avancement)
  const behind = av != null && section.prevu != null && av < section.prevu
  const relances = rows.filter(r => r.suivi === 'relance').length
  const enRetard = rows.filter(r => !r.isNew && r.suivi !== 'fait' && r.suivi !== 'relance' && daysLate(r.echeance, crDate) > 0).length
  const reponses = rows.filter(r => r.reponseRecente && r.reponse).length
  const bodyId = `cr-lot-${section.key}`

  const summary = [
    av != null && { t: `${av} %${section.prevu != null ? ` (prévu ${section.prevu} %)` : ''}`, tone: behind ? 'var(--red-text)' : undefined },
    { t: rows.length ? `${rows.length} point${rows.length > 1 ? 's' : ''}` : 'aucun point' },
    relances > 0 && { t: `${relances} à relancer`, tone: 'var(--red-text)', b: true },
    enRetard > 0 && { t: `${enRetard} en retard`, tone: 'var(--orange-deep)', b: true },
    reponses > 0 && { t: `${reponses} réponse${reponses > 1 ? 's' : ''} reçue${reponses > 1 ? 's' : ''}`, tone: 'var(--accent-text)', b: true },
  ].filter(Boolean)

  return (
    <section id={`cr-section-${section.key}`} aria-label={section.lot} style={{ ...card, padding: 0, scrollMarginTop: 130 }}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '14px 16px', minHeight: 60, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ fontSize: 13, color: 'var(--label-secondary)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: 'var(--label)' }}>
            {section.lot}
            {!isGeneral && section.entreprise ? <span style={{ fontWeight: 400, color: 'var(--label-secondary)' }}> · {section.entreprise}</span> : null}
          </span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--label-secondary)', marginTop: 2 }}>
            {summary.map((x, i) => <span key={i}>{i ? <span aria-hidden="true">· </span> : null}<span style={{ color: x.tone, fontWeight: x.b ? 700 : 400 }}>{x.t}</span></span>)}
          </span>
        </span>
      </button>

      {open && (
        <div id={bodyId} style={{ padding: '0 16px 14px' }}>
          {!isGeneral && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 6 }}>
              <label style={{ display: 'block' }}>
                <span style={lbl}>Entreprise</span>
                <input aria-label={`Entreprise du lot ${section.lot}`} value={section.entreprise || ''} list={entreprisesListId}
                  onChange={e => onSection({ entreprise: e.target.value })} placeholder="Entreprise titulaire" style={field} />
              </label>
              <div>
                <span style={lbl}>
                  Avancement
                  {section.avancement_prec != null ? ` · précédent ${section.avancement_prec} %` : ''}
                  {section.prevu != null ? ` · prévu ${section.prevu} %` : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min="0" max="100" step="5" aria-label={`Avancement du lot ${section.lot}`}
                    value={av ?? 0} onChange={e => onSection({ avancement: Number(e.target.value) })}
                    style={{ flex: 1, accentColor: 'var(--accent)', minHeight: 32 }} />
                  <input type="number" min="0" max="100" aria-label={`Avancement du lot ${section.lot} en %`}
                    value={av ?? ''} onChange={e => onSection({ avancement: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
                    style={{ ...field, width: 72, minHeight: 38, color: behind ? 'var(--red-text)' : undefined }} />
                </div>
              </div>
            </div>
          )}

          <div>
            {rows.map(r => (
              <CRPointRow key={r.key} row={r} crId={crId} crDate={crDate} lots={lots} entreprisesListId={entreprisesListId}
                onChange={(p) => onRow(r.key, p)} onRemove={() => onRemoveRow(r.key)} onMiseEnDemeure={onMiseEnDemeure} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', borderTop: '1px solid var(--separator)', paddingTop: 6 }}>
            <button type="button" onClick={onAddRow} style={linkBtn}>+ Nouveau point{isGeneral ? '' : ` — ${section.lot}`}</button>
            {!obsVisible && <button type="button" onClick={() => setShowObs(true)} style={linkBtn}>+ Observations</button>}
            {!showPhotos && !photos.length && <button type="button" onClick={() => setShowPhotos(true)} style={linkBtn}>+ Photos du lot</button>}
          </div>

          {obsVisible && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <span style={lbl}>{isGeneral ? 'Observations générales (planning, sécurité, administratif…)' : 'Observations'}</span>
                {dictation && (
                  <MicButton active={dictation.target === micId}
                    onClick={() => dictation.toggle(micId, (t) => onSection(s => ({ observations: s.observations ? `${s.observations.trimEnd()} ${t}` : t })))} />
                )}
              </div>
              <textarea aria-label={`Observations ${section.lot}`} value={section.observations || ''} autoFocus={showObs && !section.observations}
                onChange={e => onSection({ observations: e.target.value })} rows={3}
                placeholder={isGeneral ? 'Planning, sécurité, propreté, administratif…' : 'Constats, avancement, remarques…'}
                style={{ ...field, resize: 'vertical' }} />
              {dictation?.target === micId && dictation.interim && (
                <div style={{ fontSize: 12, color: 'var(--label-secondary)', fontStyle: 'italic', marginTop: 3 }}>{dictation.interim}…</div>
              )}
            </div>
          )}
          {(showPhotos || photos.length > 0) && (
            <div style={{ marginTop: 10 }}>
              <span style={lbl}>Photos du lot</span>
              <CRPhotoStrip photos={photos} onChange={(p) => onSection({ photos: p })} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
