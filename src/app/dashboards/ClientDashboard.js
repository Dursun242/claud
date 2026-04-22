'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { logout } from '../auth'
import { I, Icon } from './shared'
import { DashboardSkeleton, PageSkeleton } from '../components/Skeleton'
import { FloatingMic, NotificationBell } from '../components'
import { useFloatingMic } from '../hooks/useFloatingMic'
import { useToast } from '../contexts/ToastContext'
import { useClientDashboardData } from '../hooks/useClientDashboardData'

// Lazy-load des pages — chunks séparés par onglet, mais on garde les
// loaders référencés pour pouvoir preload() au hover/focus des boutons.
const dyn = (loader) => dynamic(loader, { loading: PageSkeleton, ssr: false })

const PAGE_LOADERS = {
  dashboard: () => import('../pages/DashboardV'),
  projects:  () => import('../pages/ProjectsV'),
  reports:   () => import('../pages/ReportsV'),
  os:        () => import('../pages/OrdresServiceV'),
  planning:  () => import('../pages/PlanningV'),
  tasks:     () => import('../pages/TasksV'),
  ai:        () => import('../pages/AIV'),
  pv:        () => import('../pages/ProcesVerbauxV'),
}
const DashboardV      = dyn(PAGE_LOADERS.dashboard)
const ProjectsV       = dyn(PAGE_LOADERS.projects)
const ReportsV        = dyn(PAGE_LOADERS.reports)
const OrdresServiceV  = dyn(PAGE_LOADERS.os)
const PlanningV       = dyn(PAGE_LOADERS.planning)
const TasksV          = dyn(PAGE_LOADERS.tasks)
const AIV             = dyn(PAGE_LOADERS.ai)
const ProcesVerbauxV  = dyn(PAGE_LOADERS.pv)
// Onglets disponibles pour le maître d'ouvrage (avec raccourci clavier « g + sc »)
// Note : OS utilise I.os (presse-papier) pour se distinguer visuellement des Comptes Rendus (I.reports)
const TABS = [
  { key:'dashboard', label:'Tableau de bord',   icon:I.dashboard, sc:'d' },
  { key:'projects',  label:'Mes Chantiers',      icon:I.projects,  sc:'p' },
  { key:'tasks',     label:'Tâches',             icon:I.tasks,     sc:'t' },
  { key:'reports',   label:'Comptes Rendus',     icon:I.reports,   sc:'r' },
  { key:'os',        label:'Ordres de Service',  icon:I.os,        sc:'o' },
  { key:'planning',  label:'Planning',           icon:I.planning,  sc:'l' },
  { key:'pv',        label:'Procès-Verbaux',     icon:I.pv,        sc:'v' },
  { key:'ai',        label:'Assistant IA',       icon:I.ai,        sc:'a' },
]

const LAST_TAB_KEY = 'idm_client_tab'

export default function ClientDashboard({ user, profile = null }) {
  const [tab,         setTab]         = useState('dashboard')
  const [isMobile,    setIsMobile]    = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen,    setHelpOpen]    = useState(false)
  const pendingGRef = useRef(null)

  // Data layer via React Query : cache staleTime 5 min → revenir sur le
  // dashboard après navigation tab browser ne refetch pas.
  const { data, loading, reload } = useClientDashboardData(profile?.prenom, profile?.nom)

  // Compat legacy : `save` prop ancienne qui setait data directement.
  // Remplacé par un invalidateQueries (refetch).
  const save = useCallback(async () => { await reload() }, [reload])

  // Détection mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Restauration du dernier onglet visité
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? sessionStorage.getItem(LAST_TAB_KEY) : null
      if (saved && TABS.some(t => t.key === saved)) setTab(saved)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { if (typeof window !== 'undefined') sessionStorage.setItem(LAST_TAB_KEY, tab) } catch { /* ignore */ }
  }, [tab])

  const { addToast } = useToast()
  // Floating mic (reconnaissance vocale → assistant IA)
  const {
    listening: floatListening, transcript: floatTranscript,
    setTranscript: setFloatTranscript, toggle: toggleFloatMic,
    clear: clearFloatMic
  } = useFloatingMic({ onError: (msg) => addToast(msg, 'warning') })

  const switchTab = useCallback((k) => {
    setTab(k)
    setSidebarOpen(false)
  }, [])

  // Onglets visités : restent montés (display:none) après la 1ère visite.
  // Évite re-mount + re-fetch à chaque switch.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]))
  useEffect(() => {
    setVisitedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]))
  }, [tab])

  // Preload du chunk d'un onglet au hover/focus du bouton sidebar.
  const preloadTab = useCallback((key) => {
    const loader = PAGE_LOADERS[key]
    if (loader) loader().catch(() => { /* silencieux */ })
  }, [])

  // Raccourcis clavier : « g + lettre », « ? » pour l'aide, Escape pour fermer
  useEffect(() => {
    const isTyping = (el) => {
      if (!el) return false
      const tag = (el.tagName || '').toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }
    const clearPending = () => { pendingGRef.current = null }
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Escape' && helpOpen) { setHelpOpen(false); return }
      if (isTyping(e.target)) return

      if (e.key === '?') { e.preventDefault(); setHelpOpen(o => !o); return }
      if (pendingGRef.current) {
        const target = TABS.find(t => t.sc === e.key.toLowerCase())
        clearPending()
        if (target) { e.preventDefault(); switchTab(target.key) }
        return
      }
      if (e.key === 'g' || e.key === 'G') {
        pendingGRef.current = setTimeout(clearPending, 1500)
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      if (pendingGRef.current) clearTimeout(pendingGRef.current)
    }
  }, [switchTab, helpOpen])

  // Prefetch jsPDF en arrière-plan (voir commentaire détaillé dans AdminDashboard)
  useEffect(() => {
    const t = setTimeout(() => {
      import('../generators').catch(() => { /* silent */ })
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  if (loading || !data) return <DashboardSkeleton role="client" />

  return (
    <div style={{
      display:'flex', height:'100vh',
      fontFamily:"var(--font-dm-sans), sans-serif",
      background:'#F1F5F9', overflow:'hidden'
    }}>
      {/* Skip link a11y */}
      <a href="#main-content" style={{
        position:'absolute', left:-9999, top:0,
        background:'#1E3A5F', color:'#fff', padding:'10px 16px',
        borderRadius:'0 0 8px 0', fontSize:13, fontWeight:600,
        textDecoration:'none', zIndex:10001,
      }}
      onFocus={e => { e.currentTarget.style.left = '0' }}
      onBlur={e => { e.currentTarget.style.left = '-9999px' }}
      >Passer au contenu principal</a>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important;outline:none}
        :focus{outline:none}
        :focus-visible{outline:2px solid #3B82F6 !important;outline-offset:2px;border-radius:4px}
        button:focus-visible,a:focus-visible,
        [role="button"]:focus-visible{outline:2px solid #3B82F6 !important;outline-offset:2px}
        @media (prefers-reduced-motion: reduce){
          *,*::before,*::after{
            animation-duration:.01ms !important;
            animation-iteration-count:1 !important;
            transition-duration:.01ms !important
          }
        }
        @media (max-width: 768px){
          input:not([type="checkbox"]):not([type="radio"]),select,textarea{font-size:16px !important}
          button:not([aria-label="Copier"]):not([aria-label="Fermer"]):not([aria-label="Fermer la notification"]):not([data-nav]){min-height:36px}
        }
      `}</style>

      {/* ── Overlay mobile ── */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position:'fixed', inset:0,
          background:'rgba(0,0,0,0.4)', zIndex:998
        }} />
      )}

      {/* ── Sidebar ── */}
      <aside aria-label="Navigation principale" style={{
        width:280, position:isMobile?'fixed':'relative',
        left:isMobile?(sidebarOpen?0:-300):0, top:0, bottom:0,
        background:'linear-gradient(180deg,#0F172A 0%,#1E293B 100%)',
        display:'flex', flexDirection:'column',
        zIndex:999, transition:'left .25s ease',
        boxShadow:isMobile&&sidebarOpen?'4px 0 24px rgba(0,0,0,0.35)':'none',
        flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:1, marginBottom:2 }}>ID MAÎTRISE</div>
          <div style={{ fontSize:9, color:'#64748B', letterSpacing:2, textTransform:'uppercase' }}>Espace Client</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex:1, padding:'6px 10px', overflowY:'auto' }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                data-nav
                onClick={() => switchTab(t.key)}
                onFocus={() => preloadTab(t.key)}
                title={`${t.label} (g ${t.sc})`}
                aria-current={active ? "page" : undefined}
                aria-label={`${t.label}, raccourci g puis ${t.sc}`}
                style={{
                position:'relative',
                width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10,
                padding:'7px 12px 7px 16px', marginBottom:1,
                border:'none', borderRadius:8, cursor:'pointer',
                fontFamily:'inherit',
                background:active?'rgba(255,255,255,0.10)':'transparent',
                color:active?'#fff':'#94A3B8',
                fontWeight:active?600:400, fontSize:13, transition:'background .15s, color .15s',
              }}
              onMouseEnter={e => {
                // Préchargement du chunk JS de l'onglet → clic instantané.
                preloadTab(t.key)
                if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                {/* Barre d'accent verticale uniforme */}
                <span aria-hidden style={{
                  position:'absolute', left:4, top:9, bottom:9, width:3, borderRadius:2,
                  background:active?'#60A5FA':'transparent', transition:'background .15s'
                }}/>
                {t.icon && <Icon d={t.icon} size={15} color={active?'#60A5FA':'#64748B'} />}
                <span style={{ flex:1 }}>{t.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer utilisateur */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
          {user && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              {user.user_metadata?.avatar_url
                ? <Image src={user.user_metadata.avatar_url}
                    width={28} height={28} unoptimized alt=""
                    style={{
                      borderRadius:'50%',
                      border:'2px solid rgba(255,255,255,0.15)'
                    }}/>
                : <div style={{
                    width:28, height:28, borderRadius:'50%',
                    background:'#3B82F6', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700, color:'#fff'
                  }}>
                    {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <div style={{ minWidth:0 }}>
                <div style={{
                  fontSize:11, fontWeight:600, color:'#fff',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                }}>
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div style={{
                  fontSize:9, color:'#64748B',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                }}>
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
      <main id="main-content" aria-label="Contenu principal" style={{
        flex:1, minWidth:0, overflowX:'hidden', overflowY:'auto',
        padding:isMobile?16:24, paddingTop:isMobile?60:24
      }}>
        {/* Topbar mobile */}
        {isMobile && (
          <div style={{
            position:'fixed', top:0, left:0, right:0, height:52,
            background:'#fff', borderBottom:'1px solid #E2E8F0',
            display:'flex', alignItems:'center', padding:'0 12px',
            zIndex:997, boxShadow:'0 1px 3px rgba(15,23,42,0.04)', gap:10
          }}>
            <button onClick={() => setSidebarOpen(s => !s)}
              aria-label="Ouvrir le menu"
              style={{
                background:'none', border:'none', fontSize:22,
                cursor:'pointer', color:'#334155', padding:'6px 8px', borderRadius:6,
                lineHeight:1,
              }}>☰</button>
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', lineHeight:1.15 }}>
              <span style={{
                fontSize:10, fontWeight:600, color:'#94A3B8',
                letterSpacing:'0.06em', textTransform:'uppercase'
              }}>Espace client</span>
              <span style={{
                fontSize:15, fontWeight:700, color:'#0F172A',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
              }}>
                {TABS.find(t => t.key === tab)?.label}
              </span>
            </div>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>switchTab(nextTab)} isMobile />
          </div>
        )}
        {!isMobile && (
          <div style={{ position:'fixed', top:12, right:24, zIndex:998 }}>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>switchTab(nextTab)} />
          </div>
        )}

        <div style={{ animation:'fadeIn .25s ease', maxWidth:1200, margin:'0 auto' }}>
          {/* Aucun chantier associé */}
          {!data?.chantiers?.length && (
            <div style={{
              background:'#FFF7ED', border:'1px solid #FED7AA',
              borderRadius:14, padding:28, marginBottom:20, textAlign:'center'
            }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔗</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#92400E', marginBottom:6 }}>
                Aucun chantier associé
              </div>
              <div style={{ fontSize:13, color:'#B45309', lineHeight:1.7 }}>
                Votre compte n&apos;est pas encore lié à un chantier.<br/>
                L&apos;administrateur doit renseigner votre prénom{" "}
                (<strong>{profile?.prenom}</strong>) dans le champ{" "}
                &quot;Client&quot; du chantier concerné.
              </div>
            </div>
          )}
          {/* Onglets visités restent montés (display:none) pour éviter
              re-mount + re-fetch à chaque switch. Voir AdminDashboard pour
              explication détaillée du pattern. */}
          {visitedTabs.has('dashboard') && (
            <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}>
              <DashboardV data={data} setTab={switchTab} m={isMobile} user={user} />
            </div>
          )}
          {visitedTabs.has('projects') && (
            <div style={{ display: tab === 'projects' ? 'block' : 'none' }}>
              <ProjectsV data={data} save={save} m={isMobile}
                reload={reload} user={user} profile={profile} readOnly />
            </div>
          )}
          {visitedTabs.has('tasks') && (
            <div style={{ display: tab === 'tasks' ? 'block' : 'none' }}>
              <TasksV data={data} save={save} m={isMobile} reload={reload} />
            </div>
          )}
          {visitedTabs.has('reports') && (
            <div style={{ display: tab === 'reports' ? 'block' : 'none' }}>
              <ReportsV data={data} save={save} m={isMobile} reload={reload} readOnly />
            </div>
          )}
          {visitedTabs.has('os') && (
            <div style={{ display: tab === 'os' ? 'block' : 'none' }}>
              <OrdresServiceV data={data} m={isMobile} reload={reload} readOnly />
            </div>
          )}
          {visitedTabs.has('planning') && (
            <div style={{ display: tab === 'planning' ? 'block' : 'none' }}>
              <PlanningV data={data} m={isMobile} />
            </div>
          )}
          {visitedTabs.has('pv') && (
            <div style={{ display: tab === 'pv' ? 'block' : 'none' }}>
              <ProcesVerbauxV data={data} m={isMobile} reload={reload} user={user} />
            </div>
          )}
          {visitedTabs.has('ai') && (
            <div style={{ display: tab === 'ai' ? 'block' : 'none' }}>
              <AIV data={data} save={save} m={isMobile}
                reload={reload} user={user} profile={profile} clientMode
                externalTranscript={floatTranscript}
                clearExternal={()=>setFloatTranscript("")} />
            </div>
          )}
        </div>
      </main>

      {/* FLOATING NEON MIC — visible sur tous les onglets sauf "ai" (qui a son propre micro inline) */}
      {tab !== 'ai' && (
        <FloatingMic
          listening={floatListening}
          onClick={toggleFloatMic}
          transcript={floatTranscript}
          isMobile={isMobile}
          onSend={() => { setTab('ai') }}
          onClear={clearFloatMic}
        />
      )}

      {/* Aide clavier (déclenchée par « ? ») */}
      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{
          position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)',
          zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:16,
          animation:'fadeIn .15s ease'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'#fff', borderRadius:14, boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
            width:'100%', maxWidth:420, padding:'20px 24px 22px', fontFamily:"var(--font-dm-sans), sans-serif"
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'#0F172A' }}>Raccourcis clavier</div>
                <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>Naviguer plus vite dans l&apos;app</div>
              </div>
              <button onClick={() => setHelpOpen(false)} aria-label="Fermer"
                style={{
                  background:'#F1F5F9', border:'none', width:28, height:28,
                  borderRadius:6, cursor:'pointer', color:'#64748B', fontSize:16
                }}>×</button>
            </div>
            <div style={{
              fontSize:10, fontWeight:700, color:'#94A3B8',
              letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6
            }}>
              Aller à (appuie sur <kbd style={kbdStyleC}>g</kbd> puis…)
            </div>
            {TABS.map(t => (
              <div key={t.key} style={{
                display:'flex', alignItems:'center',
                justifyContent:'space-between', padding:'6px 0'
              }}>
                <span style={{ fontSize:13, color:'#334155' }}>{t.label}</span>
                <kbd style={kbdStyleC}>{t.sc}</kbd>
              </div>
            ))}
            <div style={{ fontSize:10, color:'#94A3B8', marginTop:10, borderTop:'1px solid #E2E8F0', paddingTop:10 }}>
              Appuie sur <kbd style={kbdStyleC}>?</kbd> à tout moment pour réouvrir
              cette aide · <kbd style={kbdStyleC}>Esc</kbd> pour fermer
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const kbdStyleC = {
  display:'inline-flex', alignItems:'center', justifyContent:'center',
  minWidth:22, height:22, padding:'0 6px',
  background:'#F1F5F9', border:'1px solid #CBD5E1', borderBottomWidth:2,
  borderRadius:5, fontSize:11, fontWeight:600, color:'#334155', fontFamily:"var(--font-dm-sans), sans-serif"
}
