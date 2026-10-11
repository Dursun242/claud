'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { logout } from '../auth'
import { I, Icon } from './shared'
import { DashboardSkeleton, PageSkeleton } from '../components/Skeleton'
import TabErrorBoundary from '../components/TabErrorBoundary'
import { FloatingMic, NotificationBell } from '../components'
import { FLOATING_MIC_CLEARANCE } from '../components/FloatingMic'
import MobileNav, { MOBILE_NAV_HEIGHT } from '../components/MobileNav'
import LeaveGuardNotice from '../components/LeaveGuardNotice'
import { useFloatingMic } from '../hooks/useFloatingMic'
import { useToast } from '../contexts/ToastContext'
import { useClientDashboardData } from '../hooks/useClientDashboardData'
// L'accueil est le premier écran : importé directement (pas de second chargement).
import DashboardV from '../pages/DashboardV'

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

// Onglets de la barre de navigation mobile (le reste via « Plus »)
const MOBILE_NAV_ITEMS = [
  { key:'dashboard', label:'Accueil',   icon:I.dashboard },
  { key:'projects',  label:'Chantiers', icon:I.projects },
  { key:'reports',   label:'CR',        icon:I.reports },
  { key:'planning',  label:'Planning',  icon:I.planning },
]

export default function ClientDashboard({ user, profile = null }) {
  const [tab,         setTab]         = useState('dashboard')
  const [isMobile,    setIsMobile]    = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen,    setHelpOpen]    = useState(false)
  const pendingGRef = useRef(null)

  // Data layer via React Query : cache staleTime 5 min → revenir sur le
  // dashboard après navigation tab browser ne refetch pas.
  const { data, loading, reload } = useClientDashboardData(user?.id)

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

  // Focus = élément à ouvrir dans la page cible (chantier, CR, OS) quand
  // on arrive depuis le tableau de bord. ts → re-clic = re-déclenchement.
  const [focus, setFocus] = useState(null)
  const switchTab = useCallback((k, id = null) => {
    setTab(k)
    setFocus(id ? { id, ts: Date.now() } : null)
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
      background:'#F2F2F7', overflow:'hidden'
    }}>
      {/* Skip link a11y */}
      <a href="#main-content" style={{
        position:'absolute', left:-9999, top:0,
        background:'#0071E3', color:'#fff', padding:'10px 16px',
        borderRadius:'0 0 8px 0', fontSize:13, fontWeight:600,
        textDecoration:'none', zIndex:10001,
      }}
      onFocus={e => { e.currentTarget.style.left = '0' }}
      onBlur={e => { e.currentTarget.style.left = '-9999px' }}
      >Passer au contenu principal</a>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D1D6;border-radius:3px}
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
        background:'#F9F9FB', borderRight:'1px solid #E5E5EA', color:'#1C1C1E',
        display:'flex', flexDirection:'column',
        zIndex:999, transition:'left .25s ease',
        boxShadow:isMobile&&sidebarOpen?'4px 0 24px rgba(0,0,0,0.15)':'none',
        flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ padding:'18px 16px 10px' }}>
          <div style={{ fontSize:20, fontWeight:700, color:'#1C1C1E', letterSpacing:'-0.01em', marginBottom:2 }}>ID Maîtrise</div>
          <div style={{ fontSize:12, color:'#6E6E73' }}>Espace client</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex:1, padding:'4px 8px', overflowY:'auto' }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                data-nav
                data-active={active ? 'true' : 'false'}
                onClick={() => switchTab(t.key)}
                onFocus={() => preloadTab(t.key)}
                onMouseEnter={() => preloadTab(t.key)}
                title={`${t.label} (g ${t.sc})`}
                aria-current={active ? "page" : undefined}
                aria-label={`${t.label}, raccourci g puis ${t.sc}`}
                className="sidebar-tab"
                style={{
                width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:10,
                padding:'8px 10px', minHeight:38, marginBottom:2,
                border:'none', borderRadius:10, cursor:'pointer',
                fontFamily:'inherit',
                background:active?'#0071E3':'transparent',
                color:active?'#fff':'#1C1C1E',
                fontWeight:active?600:400, fontSize:15,
              }}>
                {t.icon && <Icon d={t.icon} size={18} color={active?'#fff':'#0071E3'} />}
                <span style={{ flex:1 }}>{t.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer utilisateur */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #E5E5EA' }}>
          {user && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              {user.user_metadata?.avatar_url
                ? <Image src={user.user_metadata.avatar_url}
                    width={32} height={32} unoptimized alt=""
                    style={{ borderRadius:'50%' }}/>
                : <div style={{
                    width:32, height:32, borderRadius:'50%',
                    background:'#0071E3', display:'flex',
                    alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:600, color:'#fff'
                  }}>
                    {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <div style={{ minWidth:0 }}>
                <div style={{
                  fontSize:14, fontWeight:600, color:'#1C1C1E',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                }}>
                  {user.user_metadata?.full_name || user.email}
                </div>
                <div style={{
                  fontSize:12, color:'#6E6E73',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                }}>
                  Maître d&apos;ouvrage
                </div>
              </div>
            </div>
          )}
          <button onClick={() => logout()} className="u-btn" style={{
            width:'100%', padding:'8px', minHeight:36, background:'#EFEFF0',
            color:'#D70015', border:'none',
            borderRadius:10, cursor:'pointer', fontFamily:'inherit', fontSize:14, fontWeight:500,
          }}>
            Déconnexion
          </button>
          <div style={{ fontSize:11, color:'#6E6E73', textAlign:'center', marginTop:10 }}>
            SARL ID MAÎTRISE · Le Havre
          </div>
        </div>
      </aside>

      {/* ── Contenu principal ── */}
      <main id="main-content" aria-label="Contenu principal" style={{
        flex:1, minWidth:0, overflowX:'hidden', overflowY:'auto',
        padding:isMobile?16:24, paddingTop:isMobile?60:24,
        paddingBottom:isMobile?`calc(${MOBILE_NAV_HEIGHT + 24 + (tab !== 'ai' ? FLOATING_MIC_CLEARANCE : 0)}px + env(safe-area-inset-bottom))`:24
      }}>
        {/* Topbar mobile */}
        {isMobile && (
          <div style={{
            position:'fixed', top:0, left:0, right:0, height:52,
            background:'rgba(249,249,251,0.88)',
            backdropFilter:'saturate(180%) blur(20px)', WebkitBackdropFilter:'saturate(180%) blur(20px)',
            borderBottom:'1px solid rgba(0,0,0,0.1)',
            display:'flex', alignItems:'center', padding:'0 8px',
            zIndex:997, gap:6
          }}>
            <button onClick={() => setSidebarOpen(s => !s)}
              aria-label="Ouvrir le menu"
              className="u-icon-btn"
              style={{ width:40, height:40, borderRadius:10 }}>
              <Icon d={I.menu} size={22} color="#0071E3" />
            </button>
            <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', lineHeight:1.15 }}>
              <span style={{
                fontSize:11, fontWeight:500, color:'#6E6E73',
              }}>Espace client</span>
              <span style={{
                fontSize:17, fontWeight:600, color:'#1C1C1E',
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

        <div style={{ animation:'fadeInUp .25s cubic-bezier(.4, 0, .2, 1)', maxWidth:1200, margin:'0 auto' }}>
          {/* Aucun chantier associé */}
          {!data?.chantiers?.length && (
            <div style={{
              background:'#FFF7E8', border:'1px solid #FFDDA6',
              borderRadius:14, padding:28, marginBottom:20, textAlign:'center'
            }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔗</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#A0390C', marginBottom:6 }}>
                Aucun chantier associé
              </div>
              <div style={{ fontSize:13, color:'#C93400', lineHeight:1.7 }}>
                Votre compte n&apos;est pas encore lié à un chantier.<br/>
                L&apos;administrateur doit rattacher le chantier concerné{" "}
                à votre compte (<strong>{user?.email}</strong>).
              </div>
            </div>
          )}
          {/* Onglets visités restent montés (display:none) pour éviter
              re-mount + re-fetch à chaque switch. Voir AdminDashboard pour
              explication détaillée du pattern. */}
          {visitedTabs.has('dashboard') && (
            <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}>
              <TabErrorBoundary name="dashboard" resetKey={data}>
                <DashboardV data={data} setTab={switchTab} m={isMobile} user={user} clientMode />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('projects') && (
            <div style={{ display: tab === 'projects' ? 'block' : 'none' }}>
              <TabErrorBoundary name="projects" resetKey={data}>
                <ProjectsV data={data} save={save} m={isMobile} active={tab === 'projects'}
                  reload={reload} user={user} profile={profile} readOnly
                  focusId={tab === 'projects' ? focus?.id : null} focusTs={focus?.ts} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('tasks') && (
            <div style={{ display: tab === 'tasks' ? 'block' : 'none' }}>
              <TabErrorBoundary name="tasks" resetKey={data}>
                <TasksV data={data} save={save} m={isMobile} reload={reload} active={tab === 'tasks'} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('reports') && (
            <div style={{ display: tab === 'reports' ? 'block' : 'none' }}>
              <TabErrorBoundary name="reports" resetKey={data}>
                <ReportsV data={data} save={save} m={isMobile} reload={reload} readOnly active={tab === 'reports'}
                  focusId={tab === 'reports' ? focus?.id : null} focusTs={focus?.ts} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('os') && (
            <div style={{ display: tab === 'os' ? 'block' : 'none' }}>
              <TabErrorBoundary name="os" resetKey={data}>
                <OrdresServiceV data={data} m={isMobile} reload={reload} readOnly active={tab === 'os'}
                  focusId={tab === 'os' ? focus?.id : null} focusTs={focus?.ts} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('planning') && (
            <div style={{ display: tab === 'planning' ? 'block' : 'none' }}>
              <TabErrorBoundary name="planning" resetKey={data}>
                <PlanningV data={data} m={isMobile} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('pv') && (
            <div style={{ display: tab === 'pv' ? 'block' : 'none' }}>
              <TabErrorBoundary name="pv" resetKey={data}>
                <ProcesVerbauxV data={data} m={isMobile} reload={reload} user={user} />
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('ai') && (
            <div style={{ display: tab === 'ai' ? 'block' : 'none' }}>
              <TabErrorBoundary name="ai" resetKey={data}>
                <AIV data={data} save={save} m={isMobile} active={tab === 'ai'}
                  reload={reload} user={user} profile={profile} clientMode
                  externalTranscript={floatTranscript}
                  clearExternal={()=>setFloatTranscript("")} />
              </TabErrorBoundary>
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
          bottomOffset={isMobile ? MOBILE_NAV_HEIGHT : 0}
          onSend={() => { setTab('ai') }}
          onClear={clearFloatMic}
        />
      )}

      {/* Barre de navigation basse (mobile) */}
      {isMobile && (
        <MobileNav items={MOBILE_NAV_ITEMS} active={tab} onSelect={switchTab}
          onMenu={() => setSidebarOpen(true)} />
      )}

      {/* Message quand le retour du téléphone est bloqué (fenêtre de saisie ouverte) */}
      <LeaveGuardNotice />

      {/* Aide clavier (déclenchée par « ? ») */}
      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)',
          zIndex:5000, display:'flex', alignItems:'center', justifyContent:'center', padding:16,
          animation:'fadeIn .15s ease'
        }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="aide-clavier-client" style={{
            background:'#fff', borderRadius:14, boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
            width:'100%', maxWidth:420, padding:'20px 24px 22px', fontFamily:"var(--font-dm-sans), sans-serif"
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div id="aide-clavier-client" style={{ fontSize:16, fontWeight:700, color:'#1C1C1E' }}>Raccourcis clavier</div>
                <div style={{ fontSize:11, color:'#6E6E73', marginTop:2 }}>Naviguer plus vite dans l&apos;app</div>
              </div>
              <button autoFocus onClick={() => setHelpOpen(false)} aria-label="Fermer"
                style={{
                  background:'#F2F2F7', border:'none', width:28, height:28,
                  borderRadius:6, cursor:'pointer', color:'#6E6E73', fontSize:16
                }}>×</button>
            </div>
            <div style={{
              fontSize:11, fontWeight:700, color:'#6E6E73',
              letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6
            }}>
              Aller à (appuie sur <kbd style={kbdStyleC}>g</kbd> puis…)
            </div>
            {TABS.map(t => (
              <div key={t.key} style={{
                display:'flex', alignItems:'center',
                justifyContent:'space-between', padding:'6px 0'
              }}>
                <span style={{ fontSize:13, color:'#3A3A3C' }}>{t.label}</span>
                <kbd style={kbdStyleC}>{t.sc}</kbd>
              </div>
            ))}
            <div style={{ fontSize:11, color:'#6E6E73', marginTop:10, borderTop:'1px solid #E5E5EA', paddingTop:10 }}>
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
  background:'#F2F2F7', border:'1px solid #D1D1D6', borderBottomWidth:2,
  borderRadius:5, fontSize:11, fontWeight:600, color:'#3A3A3C', fontFamily:"var(--font-dm-sans), sans-serif"
}
