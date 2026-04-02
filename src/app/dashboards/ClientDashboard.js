'use client'
import { useState, useEffect, useCallback } from 'react'
import { logout } from '../auth'
import { SB, defaultData, I, Icon } from './shared'
import DashboardV    from '../pages/DashboardV'
import ProjectsV     from '../pages/ProjectsV'
import ReportsV      from '../pages/ReportsV'
import OrdresServiceV from '../pages/OrdresServiceV'
import PlanningV     from '../pages/PlanningV'
import GoogleCalendarV from '../pages/GoogleCalendarV'

// Onglets disponibles pour le maître d'ouvrage
const TABS = [
  { key:'dashboard', label:'Tableau de bord',   icon:I.dashboard },
  { key:'projects',  label:'Mes Chantiers',      icon:I.projects  },
  { key:'reports',   label:'Comptes Rendus',     icon:I.reports   },
  { key:'os',        label:'Ordres de Service',  icon:I.reports   },
  { key:'planning',  label:'Planning',           icon:I.planning  },
  { key:'gcal',      label:'Agenda',             icon:null, isGcal:true },
]

export default function ClientDashboard({ user, profile = null }) {
  const [data,        setData]        = useState(null)
  const [tab,         setTab]         = useState('dashboard')
  const [loading,     setLoading]     = useState(true)
  const [isMobile,    setIsMobile]    = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Détection mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Chargement données
  useEffect(() => {
    (async () => {
      try {
        const sbData = await SB.loadAll()
        setData(sbData.error ? defaultData : sbData)
      } catch {
        setData(defaultData)
      }
      setLoading(false)
    })()
  }, [])

  const reload = useCallback(async () => {
    try { const sbData = await SB.loadAll(); setData(sbData) } catch { /* silently fail */ }
  }, [])

  const save = useCallback(async (d) => { setData(d) }, [])

  const switchTab = (k) => { setTab(k); if (isMobile) setSidebarOpen(false) }

  if (loading || !data) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8FAFC', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:48, height:48, border:'4px solid #E2E8F0', borderTopColor:'#1E3A5F', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:"'DM Sans',sans-serif", background:'#F1F5F9', overflow:'hidden' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* ── Overlay mobile ── */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:998 }} />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width:isMobile?260:240, position:isMobile?'fixed':'relative',
        left:isMobile?(sidebarOpen?0:-280):0, top:0, bottom:0,
        background:'linear-gradient(180deg,#0F172A 0%,#1E293B 100%)',
        display:'flex', flexDirection:'column',
        zIndex:999, transition:'left .3s ease',
        boxShadow:isMobile&&sidebarOpen?'4px 0 20px rgba(0,0,0,0.3)':'none',
        flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ padding:'24px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:1, marginBottom:2 }}>ID MAÎTRISE</div>
          <div style={{ fontSize:9, color:'#64748B', letterSpacing:2, textTransform:'uppercase' }}>Espace Client</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex:1, padding:'12px 10px', overflowY:'auto' }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => switchTab(t.key)} style={{
                width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10,
                padding:'10px 12px', marginBottom:2, border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit',
                background:active?'rgba(255,255,255,0.1)':'transparent',
                color:active?'#fff':'#94A3B8',
                fontWeight:active?600:400, fontSize:13, transition:'all .15s',
              }}>
                {t.isGcal
                  ? <span style={{ fontSize:15 }}>📅</span>
                  : t.icon && <Icon d={t.icon} size={15} color={active?'#fff':'#64748B'} />
                }
                <span>{t.label}</span>
                {active && <div style={{ marginLeft:'auto', width:4, height:4, borderRadius:'50%', background:'#3B82F6' }} />}
              </button>
            )
          })}
        </nav>

        {/* Footer utilisateur */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          {user && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              {user.user_metadata?.avatar_url
                ? <img src={user.user_metadata.avatar_url} style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.15)' }} alt="" />
                : <div style={{ width:28, height:28, borderRadius:'50%', background:'#3B82F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>
                    {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div style={{ fontSize:9, color:'#64748B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  Maître d&apos;Ouvrage
                </div>
              </div>
            </div>
          )}
          <button onClick={() => logout()} style={{
            width:'100%', padding:'8px', background:'rgba(239,68,68,0.15)',
            color:'#F87171', border:'1px solid rgba(239,68,68,0.2)',
            borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600,
          }}>
            Déconnexion
          </button>
          <div style={{ fontSize:9, color:'#334155', textAlign:'center', marginTop:10 }}>
            SARL ID MAÎTRISE · Le Havre
          </div>
        </div>
      </aside>

      {/* ── Contenu principal ── */}
      <main style={{ flex:1, overflow:'auto', padding:isMobile?16:24, paddingTop:isMobile?60:24 }}>
        {/* Topbar mobile */}
        {isMobile && (
          <div style={{ position:'fixed', top:0, left:0, right:0, height:52, background:'#fff', borderBottom:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', zIndex:997, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setSidebarOpen(s => !s)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#334155', padding:'4px 8px' }}>☰</button>
            <span style={{ fontSize:14, fontWeight:700, color:'#0F172A' }}>ID Maîtrise</span>
            <span style={{ fontSize:11, color:'#94A3B8' }}>{TABS.find(t => t.key === tab)?.label}</span>
          </div>
        )}

        <div style={{ animation:'fadeIn .25s ease', maxWidth:1200, margin:'0 auto' }}>
          {tab === 'dashboard' && <DashboardV     data={data} setTab={switchTab} m={isMobile} user={user} />}
          {tab === 'projects'  && <ProjectsV      data={data} save={save} m={isMobile} reload={reload} user={user} profile={profile} />}
          {tab === 'reports'   && <ReportsV       data={data} save={save} m={isMobile} reload={reload} />}
          {tab === 'os'        && <OrdresServiceV data={data} m={isMobile} reload={reload} />}
          {tab === 'planning'  && <PlanningV      data={data} m={isMobile} />}
          {tab === 'gcal'      && <GoogleCalendarV m={isMobile} />}
        </div>
      </main>
    </div>
  )
}
