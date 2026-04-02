'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../supabaseClient'

// ─── Calendriers ──────────────────────────────────────────────────────────────
const CALENDARS = [
  { id: 'f2f67f63d8c9594225340a23de9abfa6d6e6151f1475edaa90e3604f0c1e5c9a@group.calendar.google.com', label: 'Suivi Pro',    color: '#E53935', icon: '💼' },
  { id: 'dursunozkan88@gmail.com',                                                                      label: 'Personnel',   color: '#3B82F6', icon: '👤' },
  { id: 'family11715497678605710988@group.calendar.google.com',                                         label: 'Famille',     color: '#EC4899', icon: '🏠' },
  { id: 'fr.french#holiday@group.v.calendar.google.com',                                                label: 'Fériés',      color: '#F59E0B', icon: '🎉' },
]
const KNOWN_IDS = new Set(CALENDARS.map(c => c.id))

const GCAL_COLORS = {
  "1":"#7986CB","2":"#33B679","3":"#8E24AA","4":"#E67C73",
  "5":"#F6BF26","6":"#F4511E","7":"#039BE5","8":"#616161",
  "9":"#3F51B5","10":"#0B8043","11":"#D50000",
}

function evColor(ev) {
  if (ev.couleur && GCAL_COLORS[ev.couleur]) return GCAL_COLORS[ev.couleur]
  const cal = CALENDARS.find(c => c.id === ev.calendarId)
  return cal?.color || '#1E3A5F'
}

// ─── Helpers date ─────────────────────────────────────────────────────────────
const JOURS  = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0,0,0,0)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function isToday(date) {
  return new Date(date).toDateString() === new Date().toDateString()
}
function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
}
function fmtDayFull(date) {
  return new Date(date).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })
}
function duration(debut, fin) {
  const diff = (new Date(fin) - new Date(debut)) / 60000
  if (diff < 60) return `${diff} min`
  const h = Math.floor(diff / 60), mn = diff % 60
  return mn > 0 ? `${h}h${String(mn).padStart(2,'0')}` : `${h}h`
}

// ─── Écran connexion ──────────────────────────────────────────────────────────
function ConnectScreen({ error }) {
  return (
    <div style={{ maxWidth:460, margin:'80px auto', textAlign:'center', padding:'0 24px' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:'linear-gradient(135deg,#1E3A5F,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px', fontSize:36 }}>📅</div>
      <h2 style={{ margin:'0 0 10px', fontSize:22, fontWeight:700, color:'#0F172A' }}>Google Agenda</h2>
      <p style={{ color:'#64748B', fontSize:14, lineHeight:1.8, margin:'0 0 28px' }}>
        Connectez votre Google Agenda pour synchroniser vos événements directement dans ID Maîtrise.
      </p>
      {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:'#DC2626' }}>{error}</div>}
      <button
        onClick={async () => {
          const { createClient } = await import('@supabase/supabase-js')
          const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
          await sb.auth.signInWithOAuth({
            provider:'google',
            options:{ redirectTo:window.location.origin, scopes:'https://www.googleapis.com/auth/calendar.readonly' }
          })
        }}
        style={{ padding:'14px 32px', background:'#1E3A5F', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 14px rgba(30,58,95,0.3)' }}
      >
        Connecter Google Agenda
      </button>
    </div>
  )
}

// ─── Panneau détail événement ─────────────────────────────────────────────────
function EventPanel({ ev, onClose }) {
  if (!ev) return null
  const color = evColor(ev)
  const cal = CALENDARS.find(c => c.id === ev.calendarId)
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:999 }} />
      <div style={{ position:'fixed', top:0, right:0, width:340, height:'100%', background:'#fff', boxShadow:'-4px 0 28px rgba(0,0,0,0.14)', zIndex:1000, overflowY:'auto', fontFamily:'inherit' }}>
        <div style={{ background:color, height:5 }} />
        <div style={{ padding:'20px 20px 32px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <span style={{ fontSize:12, fontWeight:700, color:color, background:color+'22', borderRadius:20, padding:'3px 12px' }}>
              {cal ? `${cal.icon} ${cal.label}` : 'Agenda'}
            </span>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94A3B8', padding:0, lineHeight:1 }}>✕</button>
          </div>
          <h3 style={{ margin:'0 0 20px', fontSize:18, fontWeight:700, color:'#0F172A', lineHeight:1.35 }}>{ev.titre}</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <PanelRow icon="📅" text={fmtDayFull(ev.debut)} />
            {ev.allDay
              ? <PanelRow icon="🗓" text="Journée entière" />
              : <>
                  <PanelRow icon="🕐" text={`${fmtTime(ev.debut)}${ev.fin ? ` — ${fmtTime(ev.fin)}` : ''}`} />
                  {ev.fin && <PanelRow icon="⏱" text={duration(ev.debut, ev.fin)} />}
                </>
            }
            {ev.lieu && <PanelRow icon="📍" text={ev.lieu} />}
          </div>
          {ev.description && (
            <div style={{ marginTop:16, padding:'12px 14px', background:'#F8FAFC', borderRadius:10, fontSize:13, color:'#475569', lineHeight:1.65, whiteSpace:'pre-line' }}>
              {ev.description}
            </div>
          )}
          {ev.lien && (
            <a href={ev.lien} target="_blank" rel="noopener noreferrer"
              style={{ display:'block', marginTop:20, padding:'11px 16px', background:'#F1F5F9', borderRadius:10, fontSize:13, color:'#1E3A5F', fontWeight:700, textAlign:'center', textDecoration:'none' }}>
              Ouvrir dans Google Agenda ↗
            </a>
          )}
        </div>
      </div>
    </>
  )
}
function PanelRow({ icon, text }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:13 }}>
      <span style={{ fontSize:16, flexShrink:0 }}>{icon}</span>
      <span style={{ color:'#475569', lineHeight:1.5 }}>{text}</span>
    </div>
  )
}

// ─── Carte événement (liste) ──────────────────────────────────────────────────
function EventCard({ ev, onClick }) {
  const color = evColor(ev)
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background:hov?'#F8FAFC':'#fff', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'flex-start', gap:12, boxShadow:hov?'0 4px 14px rgba(0,0,0,0.08)':'0 1px 3px rgba(0,0,0,0.04)', border:'1px solid #F1F5F9', cursor:'pointer', transition:'all .15s' }}
    >
      <div style={{ width:4, borderRadius:4, alignSelf:'stretch', flexShrink:0, background:color }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, color:'#0F172A', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.titre}</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, fontSize:12, color:'#64748B' }}>
          {ev.allDay ? <span>🗓 Journée entière</span> : <span>🕐 {fmtTime(ev.debut)}{ev.fin ? ` → ${fmtTime(ev.fin)}` : ''}</span>}
          {ev.lieu && <span>📍 {ev.lieu}</span>}
        </div>
      </div>
      <span style={{ color:'#CBD5E1', fontSize:15, alignSelf:'center' }}>›</span>
    </div>
  )
}

// ─── Vue Liste ────────────────────────────────────────────────────────────────
function ListView({ events, onSelect }) {
  const groups = useMemo(() => {
    const m = {}
    for (const ev of events) {
      const day = (ev.debut||'').split('T')[0]
      if (!m[day]) m[day] = []
      m[day].push(ev)
    }
    return Object.entries(m).sort(([a],[b]) => a.localeCompare(b))
  }, [events])

  if (!events.length) return (
    <div style={{ textAlign:'center', padding:'60px 20px', color:'#94A3B8' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🗓️</div>
      <div style={{ fontSize:14 }}>Aucun événement ce mois-ci</div>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {groups.map(([day, evs]) => (
        <div key={day}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
            <div style={{ background:isToday(day)?'#1E3A5F':'transparent', color:isToday(day)?'#fff':'#64748B', border:`2px solid ${isToday(day)?'#1E3A5F':'#E2E8F0'}`, borderRadius:20, padding:'3px 14px', fontSize:12, fontWeight:700, textTransform:'capitalize', whiteSpace:'nowrap' }}>
              {isToday(day) ? "Aujourd'hui" : fmtDayFull(day)}
            </div>
            <div style={{ flex:1, height:1, background:'#E2E8F0' }} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {evs.map(ev => <EventCard key={ev.id} ev={ev} onClick={() => onSelect(ev)} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Vue Mois ─────────────────────────────────────────────────────────────────
function MonthView({ baseDate, events, onSelect }) {
  const year  = baseDate.getFullYear()
  const month = baseDate.getMonth()

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const dow   = (first.getDay() + 6) % 7
    return Array.from({ length:42 }, (_, i) => addDays(first, i - dow))
  }, [year, month])

  const byDay = useMemo(() => {
    const m = {}
    for (const ev of events) {
      if (!ev.debut) continue
      const day = ev.debut.split('T')[0]
      if (!m[day]) m[day] = []
      m[day].push(ev)
    }
    return m
  }, [events])

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {JOURS.map(j => (
          <div key={j} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'#94A3B8', padding:'6px 0', textTransform:'uppercase', letterSpacing:1 }}>{j}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((day, i) => {
          const key = day.toISOString().split('T')[0]
          const inMonth = day.getMonth() === month
          const tod = isToday(day)
          const evs = byDay[key] || []
          return (
            <div key={i} style={{ minHeight:90, background:tod?'#EFF6FF':inMonth?'#fff':'#FAFAFA', borderRadius:8, padding:'6px', border:`1px solid ${tod?'#BFDBFE':'#F1F5F9'}` }}>
              <div style={{ marginBottom:4, textAlign:'right' }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', background:tod?'#1E3A5F':'transparent', color:tod?'#fff':inMonth?'#334155':'#CBD5E1', fontSize:12, fontWeight:tod?700:400 }}>
                  {day.getDate()}
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {evs.slice(0,3).map(ev => (
                  <div key={ev.id} onClick={() => onSelect(ev)}
                    style={{ background:evColor(ev), color:'#fff', borderRadius:3, padding:'1px 5px', fontSize:10, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                    {ev.allDay ? ev.titre : `${fmtTime(ev.debut)} ${ev.titre}`}
                  </div>
                ))}
                {evs.length > 3 && <div style={{ fontSize:10, color:'#64748B', paddingLeft:4 }}>+{evs.length - 3}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Vue Semaine ──────────────────────────────────────────────────────────────
const H_START = 7, H_END = 21, H_PX = 60

function WeekView({ weekStart, events, onSelect }) {
  const days = useMemo(() => Array.from({ length:7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const now  = new Date()
  const nowFrac = now.getHours() + now.getMinutes()/60
  const nowTop  = (nowFrac - H_START) * H_PX
  const totalH  = (H_END - H_START) * H_PX
  const hours   = Array.from({ length:H_END - H_START }, (_, i) => H_START + i)

  const allDayByDay = useMemo(() => {
    const m = {}
    for (const ev of events) {
      if (!ev.allDay) continue
      const day = (ev.debut||'').split('T')[0]
      if (!m[day]) m[day] = []
      m[day].push(ev)
    }
    return m
  }, [events])

  const timedByDay = useMemo(() => {
    const m = {}
    for (const ev of events) {
      if (ev.allDay) continue
      const day = (ev.debut||'').split('T')[0]
      if (!m[day]) m[day] = []
      m[day].push(ev)
    }
    return m
  }, [events])

  return (
    <div style={{ overflowX:'auto' }}>
      {/* En-tête jours */}
      <div style={{ display:'grid', gridTemplateColumns:'48px repeat(7,1fr)', borderBottom:'2px solid #E2E8F0' }}>
        <div />
        {days.map((day, i) => {
          const key = day.toISOString().split('T')[0]
          const tod = isToday(day)
          return (
            <div key={i} style={{ borderLeft:'1px solid #F1F5F9', padding:'6px 4px 4px', background:tod?'#EFF6FF':'' }}>
              <div style={{ textAlign:'center', marginBottom:3 }}>
                <span style={{ fontSize:10, color:'#94A3B8', textTransform:'uppercase', letterSpacing:0.5 }}>{JOURS[i]} </span>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', background:tod?'#1E3A5F':'transparent', color:tod?'#fff':'#334155', fontSize:12, fontWeight:tod?700:400 }}>
                  {day.getDate()}
                </span>
              </div>
              {(allDayByDay[key]||[]).map(ev => (
                <div key={ev.id} onClick={() => onSelect(ev)}
                  style={{ background:evColor(ev), color:'#fff', borderRadius:3, padding:'1px 5px', fontSize:10, marginBottom:2, cursor:'pointer', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {ev.titre}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {/* Timeline */}
      <div style={{ display:'grid', gridTemplateColumns:'48px repeat(7,1fr)', position:'relative', height:totalH }}>
        {/* Heures */}
        <div style={{ position:'relative' }}>
          {hours.map(h => (
            <div key={h} style={{ position:'absolute', top:(h-H_START)*H_PX - 7, right:8, fontSize:10, color:'#94A3B8', fontWeight:500 }}>
              {String(h).padStart(2,'0')}h
            </div>
          ))}
        </div>
        {/* Colonnes */}
        {days.map((day, i) => {
          const key  = day.toISOString().split('T')[0]
          const evs  = timedByDay[key] || []
          const tod  = isToday(day)
          return (
            <div key={i} style={{ position:'relative', borderLeft:'1px solid #F1F5F9', background:tod?'#FAFEFF':'#fff' }}>
              {hours.map(h => (
                <div key={h} style={{ position:'absolute', top:(h-H_START)*H_PX, left:0, right:0, borderTop:'1px solid #F1F5F9' }} />
              ))}
              {/* Ligne heure courante */}
              {tod && nowTop >= 0 && nowTop <= totalH && (
                <div style={{ position:'absolute', top:nowTop, left:-2, right:0, height:2, background:'#EF4444', zIndex:10 }}>
                  <div style={{ position:'absolute', left:-3, top:-3, width:8, height:8, borderRadius:'50%', background:'#EF4444' }} />
                </div>
              )}
              {/* Événements */}
              {evs.map(ev => {
                const s = new Date(ev.debut)
                const e = ev.fin ? new Date(ev.fin) : new Date(s.getTime() + 3600000)
                const sh = s.getHours() + s.getMinutes()/60
                const eh = e.getHours() + e.getMinutes()/60
                if (eh <= H_START || sh >= H_END) return null
                const top    = Math.max(0, (sh - H_START)) * H_PX
                const height = Math.max(22, (Math.min(eh, H_END) - Math.max(sh, H_START))) * H_PX
                const color  = evColor(ev)
                return (
                  <div key={ev.id} onClick={() => onSelect(ev)}
                    style={{ position:'absolute', top, left:2, right:2, height:height-2, background:color+'22', borderLeft:`3px solid ${color}`, borderRadius:4, padding:'2px 5px', overflow:'hidden', cursor:'pointer', zIndex:5 }}>
                    <div style={{ fontWeight:700, fontSize:10, color }}>{fmtTime(ev.debut)}</div>
                    <div style={{ fontSize:10, color:'#0F172A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.titre}</div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
const NAV_BTN = { padding:'6px 10px', background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, cursor:'pointer', fontSize:16, color:'#334155', fontFamily:'inherit', lineHeight:1 }

export default function GoogleCalendarV({ m }) {
  const [events,       setEvents]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [tokenOk,      setTokenOk]      = useState(false)
  const [view,         setView]         = useState('month')
  const [monthOffset,  setMonthOffset]  = useState(0)
  const [weekOffset,   setWeekOffset]   = useState(0)
  const [selectedEv,   setSelectedEv]   = useState(null)
  const [visibleCals,  setVisibleCals]  = useState(() => new Set(CALENDARS.map(c => c.id)))

  const getRange = useCallback((v, mo, wo) => {
    const now = new Date()
    if (v === 'week') {
      const ws = startOfWeek(now)
      ws.setDate(ws.getDate() + wo * 7)
      return [ws.toISOString(), addDays(ws, 7).toISOString()]
    }
    const start = new Date(now.getFullYear(), now.getMonth() + mo, 1)
    const end   = new Date(now.getFullYear(), now.getMonth() + mo + 1, 0, 23, 59, 59)
    return [start.toISOString(), end.toISOString()]
  }, [])

  const fetchEvents = useCallback(async (token, tMin, tMax) => {
    setLoading(true); setError('')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res  = await fetch('/api/gcal', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ token, calendarIds:CALENDARS.map(c => c.id), timeMin:tMin, timeMax:tMax }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const data = await res.json()
      if (data.error === 'TOKEN_EXPIRED') {
        // Tenter un refresh de session Supabase pour obtenir un nouveau token Google
        const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data:{} }))
        const newToken = refreshData?.session?.provider_token
        if (newToken && newToken !== token) {
          await supabase.from('settings').upsert({ key:'gcal-token', value:newToken }).catch(() => {})
          // Réessayer avec le nouveau token
          const res2 = await fetch('/api/gcal', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token:newToken, calendarIds:CALENDARS.map(c=>c.id), timeMin:tMin, timeMax:tMax }) }).catch(() => null)
          if (res2?.ok) { const d2 = await res2.json(); if (!d2.error) { setEvents(d2.events||[]); return } }
        }
        await supabase.from('settings').delete().eq('key','gcal-token').catch(() => {})
        setTokenOk(false); setError("Session Google expirée. Reconnectez-vous."); setEvents([])
        return
      }
      if (data.error) { setError(data.error); setEvents([]); return }
      setEvents(data.events || [])
    } catch (e) {
      clearTimeout(timeout)
      setError(e.name === 'AbortError' ? 'Délai dépassé — vérifiez votre connexion.' : e.message)
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    (async () => {
      // Priorité 1 : token de la session active (jamais expiré côté Supabase)
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }))
      let token = session?.provider_token || null

      // Priorité 2 : token stocké en base (fallback)
      if (!token) {
        const { data: row } = await supabase.from('settings').select('value').eq('key','gcal-token').single().catch(() => ({ data:null }))
        token = row?.value || null
      }

      if (token) {
        // Mettre à jour la base si le token session est plus récent
        if (session?.provider_token) {
          await supabase.from('settings').upsert({ key:'gcal-token', value:session.provider_token }).catch(() => {})
        }
        setTokenOk(true)
        const [tMin, tMax] = getRange('month', 0, 0)
        await fetchEvents(token, tMin, tMax)
      } else { setTokenOk(false); setLoading(false) }
    })()
  }, []) // eslint-disable-line

  const getToken = useCallback(async () => {
    // Toujours essayer la session active en premier
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data:{} }))
    if (session?.provider_token) {
      await supabase.from('settings').upsert({ key:'gcal-token', value:session.provider_token }).catch(() => {})
      return session.provider_token
    }
    const { data:row } = await supabase.from('settings').select('value').eq('key','gcal-token').single().catch(() => ({ data:null }))
    return row?.value || null
  }, [])

  const navigate = useCallback(async (dir) => {
    const token = await getToken(); if (!token) return
    let mo = monthOffset, wo = weekOffset
    if (view === 'week') { wo += dir; setWeekOffset(wo) } else { mo += dir; setMonthOffset(mo) }
    await fetchEvents(token, ...getRange(view, mo, wo))
  }, [view, monthOffset, weekOffset, getRange, fetchEvents, getToken])

  const goToday = useCallback(async () => {
    const token = await getToken(); if (!token) return
    setMonthOffset(0); setWeekOffset(0)
    await fetchEvents(token, ...getRange(view, 0, 0))
  }, [view, getRange, fetchEvents, getToken])

  const switchView = useCallback(async (v) => {
    setView(v)
    const token = await getToken(); if (!token) return
    await fetchEvents(token, ...getRange(v, monthOffset, weekOffset))
  }, [monthOffset, weekOffset, getRange, fetchEvents, getToken])

  const toggleCal = (id) => setVisibleCals(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const filteredEvents = useMemo(() =>
    events.filter(ev => !ev.calendarId || !KNOWN_IDS.has(ev.calendarId) || visibleCals.has(ev.calendarId)),
    [events, visibleCals]
  )

  const periodLabel = useMemo(() => {
    const now = new Date()
    if (view === 'week') {
      const ws = startOfWeek(now); ws.setDate(ws.getDate() + weekOffset * 7)
      const fmt = d => d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
      return `${fmt(ws)} – ${fmt(addDays(ws, 6))}`
    }
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
      .toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
  }, [view, monthOffset, weekOffset])

  if (!tokenOk && !loading) return <ConnectScreen error={error} />

  const now      = new Date()
  const baseDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const weekStart = (() => { const ws = startOfWeek(now); ws.setDate(ws.getDate() + weekOffset * 7); return ws })()

  return (
    <div style={{ position:'relative', fontFamily:'inherit' }}>
      {/* ── En-tête ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ margin:0, fontSize:m?18:22, fontWeight:700, color:'#0F172A' }}>Google Agenda</h1>
          <p style={{ margin:'2px 0 0', fontSize:11, color:'#94A3B8' }}>
            {filteredEvents.length} événement{filteredEvents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Switcher vue */}
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:8, padding:3, gap:2 }}>
            {[['month','Mois'],['week','Sem.'],['list','Liste']].map(([v,l]) => (
              <button key={v} onClick={() => switchView(v)} style={{ padding:'5px 12px', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', background:view===v?'#1E3A5F':'transparent', color:view===v?'#fff':'#64748B', transition:'all .15s' }}>{l}</button>
            ))}
          </div>
          {/* Navigation */}
          <button onClick={() => navigate(-1)} style={NAV_BTN}>‹</button>
          <span style={{ fontSize:13, fontWeight:600, color:'#0F172A', minWidth:view==='week'?150:130, textAlign:'center', textTransform:'capitalize' }}>{periodLabel}</span>
          <button onClick={() => navigate(1)} style={NAV_BTN}>›</button>
          <button onClick={goToday} style={{ ...NAV_BTN, fontSize:11, padding:'6px 12px', color:'#1E3A5F', fontWeight:700 }}>Auj.</button>
        </div>
      </div>

      {/* ── Filtres calendriers ── */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {CALENDARS.map(cal => {
          const active = visibleCals.has(cal.id)
          return (
            <button key={cal.id} onClick={() => toggleCal(cal.id)} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', border:`2px solid ${cal.color}`, borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', background:active?cal.color:'transparent', color:active?'#fff':cal.color, transition:'all .15s' }}>
              <span>{cal.icon}</span>
              {!m && <span>{cal.label}</span>}
            </button>
          )
        })}
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:80 }}>
          <div style={{ width:36, height:36, border:'3px solid #E2E8F0', borderTopColor:'#1E3A5F', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
        </div>
      ) : error ? (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:24, color:'#DC2626', fontSize:14 }}>⚠️ {error}</div>
      ) : (
        <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #E2E8F0', overflow:'hidden' }}>
          <div style={{ padding:view==='week'?0:16 }}>
            {view === 'list'  && <ListView  events={filteredEvents} onSelect={setSelectedEv} />}
            {view === 'month' && <MonthView baseDate={baseDate} events={filteredEvents} onSelect={setSelectedEv} />}
            {view === 'week'  && <WeekView  weekStart={weekStart} events={filteredEvents} onSelect={setSelectedEv} />}
          </div>
        </div>
      )}

      {/* ── Panneau détail ── */}
      {selectedEv && <EventPanel ev={selectedEv} onClose={() => setSelectedEv(null)} />}

      <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
    </div>
  )
}
