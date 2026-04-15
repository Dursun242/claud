'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { phase as PHASE_COLORS, sel, fmtDate } from '../dashboards/shared'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

// ─── Helpers date ─────────────────────────────────────────
const DAY_MS = 864e5
const toD = s => new Date(s + 'T00:00:00')
const toISO = d => d.toISOString().split('T')[0]
const addDays = (d, n) => new Date(+d + n * DAY_MS)
const diffDays = (a, b) => Math.round((+b - +a) / DAY_MS)
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─── Constantes layout ────────────────────────────────────
const ROW_H = 36
const LABEL_W = 188

export default function PlanningV({ data, m }) {
  const { addToast } = useToast()
  const [filter,    setFilter]    = useState('all')
  const [view,      setView]      = useState('gantt')
  const [pxDay,     setPxDay]     = useState(22)
  const [localPlan, setLocalPlan] = useState(null) // optimistic updates
  const [dragId,    setDragId]    = useState(null)
  const [saving,    setSaving]    = useState(null)
  const dragRef = useRef(null)   // { id, type, startX, origDebut, origFin }

  // Refs stables pour éviter les re-abonnements aux events globaux
  const pxDayRef  = useRef(pxDay)
  const planRef   = useRef(null)
  useEffect(() => { pxDayRef.current = pxDay }, [pxDay])
  useEffect(() => { planRef.current = localPlan ?? data.planning ?? [] }, [localPlan, data.planning])

  const planData = localPlan ?? (data.planning || [])

  const chantierById = useMemo(() => {
    const map = new Map()
    ;(data.chantiers || []).forEach(c => map.set(c.id, c))
    return map
  }, [data.chantiers])

  const filtered = useMemo(() =>
    filter === 'all'
      ? planData
      : planData.filter(p => (p.chantierId || p.chantier_id) === filter)
  , [filter, planData])

  // ─── Bornes de la timeline ────────────────────────────
  const { minDate, totalDays, months, todayPct } = useMemo(() => {
    if (!planData.length) {
      const min = addDays(new Date(), -7)
      return { minDate: min, totalDays: 60, months: [], todayPct: 11.7 }
    }
    const starts = planData.map(p => +toD(p.debut))
    const ends   = planData.map(p => +toD(p.fin))
    const minD = addDays(new Date(Math.min(...starts)), -7)
    const maxD = addDays(new Date(Math.max(...ends)), 14)
    const days = diffDays(minD, maxD) + 1

    // Marqueurs de mois
    const ms = []
    let cur = new Date(minD.getFullYear(), minD.getMonth(), 1)
    while (+cur <= +maxD) {
      const off = diffDays(minD, cur)
      if (off >= 0) ms.push({ label: `${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`, off })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }

    const todayOff = diffDays(minD, new Date())
    return { minDate: minD, totalDays: days, months: ms, todayPct: (todayOff / days) * 100 }
  }, [planData])

  // ─── Drag & Drop ─────────────────────────────────────
  const onBarDown = useCallback((e, item, type) => {
    e.preventDefault()
    e.stopPropagation()
    const x = e.touches ? e.touches[0].clientX : e.clientX
    dragRef.current = { id: item.id, type, startX: x, origDebut: item.debut, origFin: item.fin }
    setDragId(item.id)
  }, [])

  // Utilise des refs → handler stable, pas de re-abonnement inutile
  const onMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    const x = e.touches ? e.touches[0].clientX : e.clientX
    const delta = Math.round((x - drag.startX) / pxDayRef.current)
    setLocalPlan(() => {
      const base = planRef.current ?? []
      return base.map(p => {
        if (p.id !== drag.id) return p
        if (drag.type === 'move') {
          return {
            ...p,
            debut: toISO(addDays(toD(drag.origDebut), delta)),
            fin:   toISO(addDays(toD(drag.origFin),   delta)),
          }
        }
        // resize (bord droit)
        const newFin = addDays(toD(drag.origFin), delta)
        return +newFin <= +toD(p.debut) ? p : { ...p, fin: toISO(newFin) }
      })
    })
  }, []) // stable

  const onUp = useCallback(async () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDragId(null)

    const updated = (planRef.current ?? []).find(p => p.id === drag.id)
    if (!updated || (updated.debut === drag.origDebut && updated.fin === drag.origFin)) return

    setSaving(drag.id)
    try {
      const { error } = await supabase
        .from('planning')
        .update({ debut: updated.debut, fin: updated.fin })
        .eq('id', drag.id)
      if (error) throw error
      addToast('Planning mis à jour', 'success')
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
      setLocalPlan(null)
    } finally {
      setSaving(null)
    }
  }, [addToast]) // stable

  // Abonner les handlers globaux une seule fois
  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [onMove, onUp])

  const isEmpty  = planData.length === 0
  const totalW   = totalDays * pxDay
  const showToday = todayPct >= 0 && todayPct <= 100

  return (
    <div>
      {/* ── En-tête ───────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>Planning</h1>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {filtered.length} tâche{filtered.length !== 1 ? 's' : ''} planifiée{filtered.length !== 1 ? 's' : ''}
            {filter !== 'all' && <> · filtre actif</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Zoom +/- (Gantt uniquement) */}
          {view === 'gantt' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setPxDay(d => Math.max(8, d - 4))}  style={zBtnS}>−</button>
              <span style={{ fontSize: 10, color: '#94A3B8', minWidth: 34, textAlign: 'center' }}>{pxDay}px/j</span>
              <button onClick={() => setPxDay(d => Math.min(80, d + 4))} style={zBtnS}>+</button>
            </div>
          )}
          {/* Toggle Gantt / Liste */}
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2 }}>
            {[['gantt', '📊 Gantt'], ['list', '☰ Liste']].map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? '#0F172A' : '#94A3B8',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all .15s',
              }}>{lbl}</button>
            ))}
          </div>
          {/* Filtre chantier */}
          <select style={{ ...sel, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">🏗️ Tous les chantiers</option>
            {data.chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {isEmpty ? (
        /* ══ ÉTAT VIDE ══════════════════════════════════ */
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Planning vide</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            Ajoute des tâches planifiées depuis la fiche d'un chantier pour les voir apparaître ici.
          </div>
        </div>
      ) : view === 'list' ? (
        /* ══ VUE LISTE (originale) ══════════════════════ */
        <div style={{ background: '#fff', borderRadius: 12, padding: m ? 12 : 18, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed #E2E8F0', minWidth: m ? 500 : 'auto' }}>
            <div style={{ width: m ? 150 : 200, flexShrink: 0, paddingRight: 12, fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tâche</div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>
              <span>{fmtDate(minDate)}</span>
              {showToday && <span style={{ color: '#EF4444' }}>⚊ Aujourd'hui</span>}
              <span>{fmtDate(addDays(minDate, totalDays))}</span>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '24px 0', fontSize: 13 }}>Aucune tâche pour ce chantier.</div>
          ) : filtered.map(p => {
            const ch = chantierById.get(p.chantierId || p.chantier_id)
            const s  = Math.max(0, diffDays(minDate, toD(p.debut)))
            const d  = Math.max(1, diffDays(toD(p.debut), toD(p.fin)) + 1)
            const c  = PHASE_COLORS[ch?.phase] || '#3B82F6'
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F8FAFC', minWidth: m ? 500 : 'auto' }}>
                <div style={{ width: m ? 150 : 200, flexShrink: 0, paddingRight: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tache}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch?.nom} • {p.lot}</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 24 }}>
                  {showToday && (
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: -2, bottom: -2, width: 0, borderLeft: '1.5px dashed #EF4444', zIndex: 1, pointerEvents: 'none' }} />
                  )}
                  <div
                    title={`${fmtDate(p.debut)} → ${fmtDate(p.fin)} · ${p.avancement}%`}
                    style={{ position: 'absolute', left: `${s / totalDays * 100}%`, width: `${d / totalDays * 100}%`, top: 3, height: 18, background: c + '22', borderRadius: 5, border: `1.5px solid ${c}`, overflow: 'hidden' }}
                  >
                    <div style={{ width: `${p.avancement}%`, height: '100%', background: c + '55', borderRadius: 4 }} />
                    <span style={{ position: 'absolute', right: 4, top: 1, fontSize: 9, fontWeight: 700, color: c }}>{p.avancement}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ══ VUE GANTT ══════════════════════════════════ */
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
          {/* Aide */}
          <div style={{ padding: '6px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 10, color: '#94A3B8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>↔ Glisser la barre pour déplacer</span>
            <span>⊣⊢ Glisser le bord droit pour redimensionner</span>
            {saving && <span style={{ color: '#3B82F6', fontWeight: 600 }}>💾 Sauvegarde…</span>}
          </div>

          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: m ? '65vh' : '72vh' }}>
            <div style={{ display: 'inline-block', minWidth: '100%', position: 'relative' }}>

              {/* ── En-tête mois (sticky) ── */}
              <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                <div style={{
                  width: LABEL_W, flexShrink: 0, borderRight: '2px solid #E2E8F0',
                  padding: '0 12px', display: 'flex', alignItems: 'center',
                  fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em',
                  height: 34,
                }}>TÂCHE</div>

                <div style={{ width: totalW, flexShrink: 0, position: 'relative', height: 34 }}>
                  {/* Lignes de séparation des mois */}
                  {months.map((mo, i) => (
                    <div key={i} style={{ position: 'absolute', left: mo.off * pxDay, top: 0, bottom: 0, borderLeft: '1px solid #E2E8F0' }}>
                      <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                        {mo.label}
                      </span>
                    </div>
                  ))}
                  {/* Ligne "Aujourd'hui" dans l'en-tête */}
                  {showToday && (
                    <div style={{ position: 'absolute', left: (todayPct / 100) * totalW, top: 0, bottom: -2, borderLeft: '2px solid #EF4444', zIndex: 2 }}>
                      <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, fontWeight: 700, color: '#EF4444', whiteSpace: 'nowrap', background: '#FEF2F2', padding: '1px 4px', borderRadius: 3 }}>
                        Auj.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Lignes de tâches ── */}
              {filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  Aucune tâche pour ce chantier.
                </div>
              ) : filtered.map((p, idx) => {
                const ch       = chantierById.get(p.chantierId || p.chantier_id)
                const color    = PHASE_COLORS[ch?.phase] || '#3B82F6'
                const startOff = diffDays(minDate, toD(p.debut))
                const dur      = Math.max(1, diffDays(toD(p.debut), toD(p.fin)) + 1)
                const barLeft  = startOff * pxDay
                const barWidth = Math.max(dur * pxDay, 16)
                const isActive = dragId === p.id
                const isSaving = saving === p.id
                const rowBg    = isActive ? '#EFF6FF' : idx % 2 === 0 ? '#FAFBFC' : '#fff'

                return (
                  <div key={p.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #F1F5F9', background: rowBg }}>

                    {/* Colonne label (sticky gauche) */}
                    <div style={{
                      width: LABEL_W, flexShrink: 0,
                      borderRight: '1px solid #E2E8F0',
                      padding: '0 12px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      position: 'sticky', left: 0, background: rowBg, zIndex: 3,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.tache}
                      </div>
                      <div style={{ fontSize: 9, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch?.nom} · {p.lot}
                      </div>
                    </div>

                    {/* Zone de la grille */}
                    <div style={{ width: totalW, flexShrink: 0, position: 'relative' }}>
                      {/* Lignes de mois en fond */}
                      {months.map((mo, i) => (
                        <div key={i} style={{ position: 'absolute', left: mo.off * pxDay, top: 0, bottom: 0, borderLeft: '1px solid #F1F5F9' }} />
                      ))}
                      {/* Ligne "Aujourd'hui" */}
                      {showToday && (
                        <div style={{ position: 'absolute', left: (todayPct / 100) * totalW, top: 0, bottom: 0, borderLeft: '2px solid rgba(239,68,68,0.2)', zIndex: 1, pointerEvents: 'none' }} />
                      )}

                      {/* ── La barre Gantt ── */}
                      <div
                        onMouseDown={e => onBarDown(e, p, 'move')}
                        onTouchStart={e => onBarDown(e, p, 'move')}
                        style={{
                          position: 'absolute',
                          left: barLeft,
                          width: barWidth,
                          top: 5,
                          height: ROW_H - 10,
                          borderRadius: 5,
                          background: isActive ? color + 'cc' : color + '2e',
                          border: `1.5px solid ${color}`,
                          cursor: isActive ? 'grabbing' : 'grab',
                          zIndex: isActive ? 5 : 2,
                          opacity: isSaving ? 0.6 : 1,
                          transition: isSaving ? 'opacity .3s' : isActive ? 'none' : 'box-shadow .15s',
                          boxShadow: isActive ? `0 3px 14px ${color}55` : 'none',
                          userSelect: 'none',
                          touchAction: 'none',
                          overflow: 'visible',
                        }}
                        title={`${fmtDate(p.debut)} → ${fmtDate(p.fin)}  ·  ${p.avancement || 0}% avancement`}
                      >
                        {/* Barre d'avancement */}
                        <div style={{ width: `${p.avancement || 0}%`, height: '100%', background: color + '55', borderRadius: 4, pointerEvents: 'none' }} />

                        {/* % affiché si la barre est assez large */}
                        {barWidth > 28 && (
                          <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: color, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                            {p.avancement || 0}%
                          </span>
                        )}

                        {/* Poignée de redimensionnement (bord droit) */}
                        <div
                          onMouseDown={e => { e.stopPropagation(); onBarDown(e, p, 'resize') }}
                          onTouchStart={e => { e.stopPropagation(); onBarDown(e, p, 'resize') }}
                          style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0, width: 8,
                            cursor: 'ew-resize',
                            borderRadius: '0 4px 4px 0',
                            background: color + '33',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <div style={{ width: 2, height: 10, background: color, borderRadius: 1, opacity: 0.7 }} />
                        </div>

                        {/* Tooltip dates flottant (pendant le drag) */}
                        {isActive && (
                          <div style={{
                            position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                            background: '#0F172A', color: '#fff', fontSize: 10, fontWeight: 600,
                            padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          }}>
                            {fmtDate(p.debut)} → {fmtDate(p.fin)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bouton zoom +/-
const zBtnS = {
  width: 26, height: 26, border: '1px solid #E2E8F0', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', color: '#334155',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
