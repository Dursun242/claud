'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { phase as PHASE_COLORS, sel, fmtDate } from '../dashboards/shared'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'

// ─── Helpers date ──────────────────────────────────────────
const DAY_MS = 864e5
const toD  = s => new Date(s + 'T00:00:00')
const toISO = d => d.toISOString().split('T')[0]
const addDays  = (d, n) => new Date(+d + n * DAY_MS)
const diffDays = (a, b) => Math.round((+b - +a) / DAY_MS)
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ─── Constantes layout ─────────────────────────────────────
const ROW_H   = 34
const HDR_H   = 28
const LABEL_W = 210

// ─── Couleur par statut OS ─────────────────────────────────
const OS_COLOR = {
  Brouillon: '#94A3B8', Émis: '#3B82F6', Signé: '#8B5CF6',
  'En cours': '#F59E0B', Terminé: '#10B981', Annulé: '#EF4444',
}

// ─── Bouton zoom ───────────────────────────────────────────
const zBtnS = {
  width: 26, height: 26, border: '1px solid #E2E8F0', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', color: '#334155',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

// ─── Vue Liste ─────────────────────────────────────────────
function ListeView({ filteredChantiers, osByChantier, m }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {filteredChantiers.map(c => {
        const osList = osByChantier.get(c.id) || []
        if (!osList.length) return null
        const color = PHASE_COLORS[c.phase] || '#3B82F6'
        return (
          <div key={c.id} style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
            {/* En-tête chantier */}
            <div style={{ background: color + '12', borderLeft: `3px solid ${color}`, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{c.nom}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                  {c.date_debut ? fmtDate(c.date_debut) : '—'} → {c.date_fin ? fmtDate(c.date_fin) : '—'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{osList.length} OS</div>
            </div>
            {/* Lignes OS */}
            <div>
              {osList.map((os, i) => (
                <div key={os.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderTop: i > 0 ? '1px solid #F8FAFC' : 'none', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 70 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>{os.numero}</div>
                    <div style={{ fontSize: 10, color: OS_COLOR[os.statut] || '#94A3B8', fontWeight: 600 }}>{os.statut}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>{os.artisan_specialite || os.artisan_nom || '—'}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8' }}>{os.artisan_nom}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap' }}>
                    {os.date_intervention ? fmtDate(os.date_intervention) : '—'}
                    {' → '}
                    {os.date_fin_prevue ? fmtDate(os.date_fin_prevue) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────
export default function PlanningV({ data, m, reload }) {
  const { addToast } = useToast()
  const [filter,   setFilter]   = useState('all')
  const [view,     setView]     = useState('gantt')
  const [pxDay,    setPxDay]    = useState(18)
  const [localOS,  setLocalOS]  = useState(null)  // optimistic updates
  const [dragId,   setDragId]   = useState(null)
  const [saving,   setSaving]   = useState(null)

  const dragRef   = useRef(null)  // { id, type, startX, origDebut, origFin }
  const pxDayRef  = useRef(pxDay)
  const osRef     = useRef(null)  // ref stable pour le handler de drag
  const scrollRef = useRef(null)  // ref pour l'élément scrollable Gantt

  useEffect(() => { pxDayRef.current = pxDay }, [pxDay])

  const chantiers     = data.chantiers     || []
  const ordresService = data.ordresService || []

  // OS planifiés : ceux qui ont au moins une date d'intervention
  const osPlanned = useMemo(() =>
    ordresService.filter(os =>
      os.date_intervention && os.date_fin_prevue &&
      !['Annulé'].includes(os.statut)
    ), [ordresService]
  )

  // Données courantes (avec mises à jour optimistes pendant le drag)
  const currentOS = localOS ?? osPlanned
  useEffect(() => { osRef.current = currentOS }, [currentOS])

  // Chantiers filtrés selon le sélecteur
  const filteredChantiers = useMemo(() =>
    filter === 'all' ? chantiers : chantiers.filter(c => c.id === filter),
    [filter, chantiers]
  )

  // OS regroupés par chantier_id
  const osByChantier = useMemo(() => {
    const map = new Map()
    currentOS.forEach(os => {
      const cid = os.chantier_id
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid).push(os)
    })
    return map
  }, [currentOS])

  // ─── Bornes globales de la timeline ───────────────────────
  const { minDate, totalDays, months, todayPct } = useMemo(() => {
    const pts = []
    chantiers.forEach(c => {
      if (c.date_debut) pts.push(+toD(c.date_debut))
      if (c.date_fin)   pts.push(+toD(c.date_fin))
    })
    osPlanned.forEach(os => {
      if (os.date_intervention) pts.push(+toD(os.date_intervention))
      if (os.date_fin_prevue)   pts.push(+toD(os.date_fin_prevue))
    })

    if (!pts.length) {
      const min = addDays(new Date(), -30)
      return { minDate: min, totalDays: 120, months: [], todayPct: 25 }
    }

    const minD = addDays(new Date(Math.min(...pts)), -7)
    const maxD = addDays(new Date(Math.max(...pts)), 14)
    const days = diffDays(minD, maxD) + 1

    const ms = []
    let cur = new Date(minD.getFullYear(), minD.getMonth(), 1)
    while (+cur <= +maxD) {
      const off = diffDays(minD, cur)
      if (off >= 0) ms.push({ label: `${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`, off })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
    const todayOff = diffDays(minD, new Date())
    return { minDate: minD, totalDays: days, months: ms, todayPct: (todayOff / days) * 100 }
  }, [chantiers, osPlanned])

  // ─── Drag & Drop (sauvegarde sur ordres_service) ───────────
  const onBarDown = useCallback((e, os, type) => {
    e.preventDefault()
    e.stopPropagation()
    const x = e.touches ? e.touches[0].clientX : e.clientX
    dragRef.current = { id: os.id, type, startX: x, origDebut: os.date_intervention, origFin: os.date_fin_prevue }
    setDragId(os.id)
  }, [])

  const onMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    const x = e.touches ? e.touches[0].clientX : e.clientX
    const delta = Math.round((x - drag.startX) / pxDayRef.current)
    setLocalOS(() => {
      const base = osRef.current ?? []
      return base.map(os => {
        if (os.id !== drag.id) return os
        if (drag.type === 'move') {
          return {
            ...os,
            date_intervention: toISO(addDays(toD(drag.origDebut), delta)),
            date_fin_prevue:   toISO(addDays(toD(drag.origFin),   delta)),
          }
        }
        // resize (bord droit)
        const newFin = addDays(toD(drag.origFin), delta)
        return +newFin <= +toD(os.date_intervention) ? os : { ...os, date_fin_prevue: toISO(newFin) }
      })
    })
  }, [])

  const onUp = useCallback(async () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDragId(null)

    const updated = (osRef.current ?? []).find(os => os.id === drag.id)
    if (!updated ||
        (updated.date_intervention === drag.origDebut &&
         updated.date_fin_prevue   === drag.origFin)) return

    setSaving(drag.id)
    try {
      const { error } = await supabase
        .from('ordres_service')
        .update({ date_intervention: updated.date_intervention, date_fin_prevue: updated.date_fin_prevue })
        .eq('id', drag.id)
      if (error) throw error
      addToast('OS mis à jour', 'success')
      reload?.()
    } catch {
      addToast('Erreur lors de la sauvegarde', 'error')
      setLocalOS(null)
    } finally { setSaving(null) }
  }, [addToast, reload])

  // Abonnement global unique aux events de drag
  useEffect(() => {
    window.addEventListener('mousemove',  onMove)
    window.addEventListener('mouseup',    onUp)
    window.addEventListener('touchmove',  onMove, { passive: false })
    window.addEventListener('touchend',   onUp)
    return () => {
      window.removeEventListener('mousemove',  onMove)
      window.removeEventListener('mouseup',    onUp)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend',   onUp)
    }
  }, [onMove, onUp])

  const totalW    = totalDays * pxDay
  const showToday = todayPct >= 0 && todayPct <= 100

<<<<<<< HEAD
=======
  // Scroller jusqu'à aujourd'hui
  const scrollToToday = useCallback(() => {
    if (!scrollRef.current || !showToday) return
    const todayX = (todayPct / 100) * totalW - 200
    scrollRef.current.scrollLeft = Math.max(0, todayX)
  }, [showToday, todayPct, totalW])

>>>>>>> 9961db3 (Ajouter le bouton 'Aujourd'hui' sur le planning Gantt)
  // Y a-t-il au moins un OS planifié dans les chantiers filtrés ?
  const hasData = filteredChantiers.some(c => (osByChantier.get(c.id) || []).length > 0)

  return (
    <div>
      {/* ── En-tête ───────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>Planning</h1>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {osPlanned.length} OS planifié{osPlanned.length !== 1 ? 's' : ''}
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
          {/* Bouton Aujourd'hui (Gantt uniquement) */}
          {view === 'gantt' && (
            <button onClick={scrollToToday} disabled={!showToday} style={{
              padding: '4px 12px', border: '1px solid #E2E8F0', borderRadius: 6, cursor: showToday ? 'pointer' : 'not-allowed',
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              background: '#fff', color: showToday ? '#0F172A' : '#CBD5E1',
              opacity: showToday ? 1 : 0.5,
              transition: 'all .15s',
            }}>📍 Aujourd'hui</button>
          )}
          {/* Filtre chantier */}
          <select style={{ ...sel, width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">🏗️ Tous les chantiers</option>
            {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {!hasData ? (
        /* ══ ÉTAT VIDE ════════════════════════════════════ */
        <div style={{ background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>Aucun OS planifié</div>
          <div style={{ fontSize: 12, color: '#94A3B8', maxWidth: 340, margin: '0 auto' }}>
            Pour afficher un lot dans le Gantt, renseigne une <strong>date d'intervention</strong> et une <strong>date de fin prévue</strong> sur les Ordres de Service du chantier.
          </div>
        </div>
      ) : view === 'list' ? (
        /* ══ VUE LISTE ════════════════════════════════════ */
        <ListeView filteredChantiers={filteredChantiers} osByChantier={osByChantier} m={m} />
      ) : (
        /* ══ VUE GANTT ════════════════════════════════════ */
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>

          {/* Aide */}
          <div style={{ padding: '5px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 10, color: '#94A3B8', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>↔ Glisser la barre pour déplacer</span>
            <span>⊣⊢ Bord droit pour redimensionner</span>
            {saving && <span style={{ color: '#3B82F6', fontWeight: 600 }}>💾 Sauvegarde…</span>}
          </div>

          <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: m ? '65vh' : '72vh' }}>
            <div style={{ display: 'inline-block', minWidth: '100%', position: 'relative' }}>

              {/* ── En-tête mois (sticky) ── */}
              <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '2px solid #E2E8F0', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', height: 34 }}>
                  CHANTIER / OS
                </div>
                <div style={{ width: totalW, flexShrink: 0, position: 'relative', height: 34 }}>
                  {months.map((mo, i) => (
                    <div key={i} style={{ position: 'absolute', left: mo.off * pxDay, top: 0, bottom: 0, borderLeft: '1px solid #E2E8F0' }}>
                      <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                        {mo.label}
                      </span>
                    </div>
                  ))}
                  {showToday && (
                    <div style={{ position: 'absolute', left: (todayPct / 100) * totalW, top: 0, bottom: -2, borderLeft: '2px solid #EF4444', zIndex: 2 }}>
                      <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, fontWeight: 700, color: '#EF4444', whiteSpace: 'nowrap', background: '#FEF2F2', padding: '1px 4px', borderRadius: 3 }}>
                        Auj.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Groupes par chantier ── */}
              {filteredChantiers.map(c => {
                const osList = osByChantier.get(c.id) || []
                if (!osList.length) return null
                const color = PHASE_COLORS[c.phase] || '#3B82F6'

                // Barre du chantier (fond, date_debut → date_fin)
                const chStart  = c.date_debut ? diffDays(minDate, toD(c.date_debut)) : null
                const chEnd    = c.date_fin   ? diffDays(minDate, toD(c.date_fin))   : null
                const chBarL   = chStart != null ? Math.max(0, chStart) * pxDay : null
                const chBarW   = (chStart != null && chEnd != null) ? Math.max(8, (chEnd - chStart + 1) * pxDay) : null

                return (
                  <div key={c.id}>
                    {/* ── Ligne en-tête chantier ── */}
                    <div style={{ display: 'flex', height: HDR_H, background: color + '18', borderBottom: `1px solid ${color}30` }}>
                      <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `2px solid ${color}40`, padding: '0 12px', display: 'flex', alignItems: 'center', position: 'sticky', left: 0, background: color + '18', zIndex: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.nom}
                        </div>
                      </div>
                      <div style={{ width: totalW, flexShrink: 0, position: 'relative' }}>
                        {/* Fond de la période du chantier */}
                        {chBarL != null && chBarW != null && (
                          <div style={{ position: 'absolute', left: chBarL, width: chBarW, top: 4, height: HDR_H - 8, background: color + '22', borderRadius: 3, border: `1px dashed ${color}60` }} />
                        )}
                        {showToday && (
                          <div style={{ position: 'absolute', left: (todayPct / 100) * totalW, top: 0, bottom: 0, borderLeft: '2px solid rgba(239,68,68,0.15)', pointerEvents: 'none' }} />
                        )}
                      </div>
                    </div>

                    {/* ── Lignes OS ── */}
                    {osList.map((os, idx) => {
                      const osColor  = OS_COLOR[os.statut] || '#3B82F6'
                      const startOff = diffDays(minDate, toD(os.date_intervention))
                      const dur      = Math.max(1, diffDays(toD(os.date_intervention), toD(os.date_fin_prevue)) + 1)
                      const barLeft  = startOff * pxDay
                      const barWidth = Math.max(dur * pxDay, 16)
                      const isActive = dragId === os.id
                      const isSaving = saving === os.id
                      const rowBg    = isActive ? '#EFF6FF' : idx % 2 === 0 ? '#FAFBFC' : '#fff'

                      return (
                        <div key={os.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid #F1F5F9', background: rowBg }}>

                          {/* Colonne label */}
                          <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', padding: '0 12px 0 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'sticky', left: 0, background: rowBg, zIndex: 3 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {os.artisan_specialite || os.artisan_nom || os.numero}
                            </div>
                            <div style={{ fontSize: 9, color: osColor, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {os.numero} · {os.statut}
                            </div>
                          </div>

                          {/* Zone grille */}
                          <div style={{ width: totalW, flexShrink: 0, position: 'relative' }}>
                            {/* Lignes de mois en fond */}
                            {months.map((mo, i) => (
                              <div key={i} style={{ position: 'absolute', left: mo.off * pxDay, top: 0, bottom: 0, borderLeft: '1px solid #F1F5F9' }} />
                            ))}
                            {showToday && (
                              <div style={{ position: 'absolute', left: (todayPct / 100) * totalW, top: 0, bottom: 0, borderLeft: '2px solid rgba(239,68,68,0.15)', zIndex: 1, pointerEvents: 'none' }} />
                            )}

                            {/* ── Barre Gantt ── */}
                            <div
                              onMouseDown={e => onBarDown(e, os, 'move')}
                              onTouchStart={e => onBarDown(e, os, 'move')}
                              title={`${os.artisan_specialite || os.artisan_nom} — ${fmtDate(os.date_intervention)} → ${fmtDate(os.date_fin_prevue)}`}
                              style={{
                                position: 'absolute',
                                left: barLeft, width: barWidth,
                                top: 5, height: ROW_H - 10,
                                borderRadius: 5,
                                background: isActive ? osColor + 'cc' : osColor + '2e',
                                border: `1.5px solid ${osColor}`,
                                cursor: isActive ? 'grabbing' : 'grab',
                                zIndex: isActive ? 5 : 2,
                                opacity: isSaving ? 0.6 : 1,
                                transition: isSaving ? 'opacity .3s' : isActive ? 'none' : 'box-shadow .15s',
                                boxShadow: isActive ? `0 3px 14px ${osColor}55` : 'none',
                                userSelect: 'none', touchAction: 'none',
                                overflow: 'visible',
                              }}
                            >
                              {/* Libellé dans la barre */}
                              {barWidth > 32 && (
                                <span style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 700, color: osColor, pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: barWidth - 20 }}>
                                  {os.artisan_specialite || os.numero}
                                </span>
                              )}

                              {/* Poignée de redimensionnement (bord droit) */}
                              <div
                                onMouseDown={e => { e.stopPropagation(); onBarDown(e, os, 'resize') }}
                                onTouchStart={e => { e.stopPropagation(); onBarDown(e, os, 'resize') }}
                                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', borderRadius: '0 4px 4px 0', background: osColor + '33', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <div style={{ width: 2, height: 10, background: osColor, borderRadius: 1, opacity: 0.7 }} />
                              </div>

                              {/* Tooltip dates pendant le drag */}
                              {isActive && (
                                <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: '#0F172A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                                  {fmtDate(os.date_intervention)} → {fmtDate(os.date_fin_prevue)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
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
