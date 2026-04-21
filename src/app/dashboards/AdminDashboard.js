'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { supabase } from '../supabaseClient'
import { logout } from '../auth'
import { FloatingMic, NotificationBell } from '../components'
import { DashboardSkeleton, PageSkeleton } from '../components/Skeleton'
import KeyboardHelpModal from '../components/KeyboardHelpModal'
import { useFloatingMic } from '../hooks/useFloatingMic'
import { useToast } from '../contexts/ToastContext'
import { seedDemoData } from '../lib/seedDemoData'

import { SB, defaultData, I, Icon } from './shared'

// Lazy-load des pages : chaque page devient son propre chunk et n'est
// téléchargée qu'au premier affichage de l'onglet correspondant.
// Gain : bundle initial réduit de ~60-80% (on n'embarque plus 8 pages au démarrage).
const dyn = (loader) => dynamic(loader, { loading: PageSkeleton, ssr: false })

// Clé localStorage pour la persistance de l'onglet actif (survit au refresh)
const LAST_TAB_KEY = 'idm_admin_tab'

const AdminV = dyn(() => import('../pages/AdminV'))
const DashboardV = dyn(() => import('../pages/DashboardV'))
const QontoV = dyn(() => import('../pages/QontoV'))
const ProjectsV = dyn(() => import('../pages/ProjectsV'))
const PlanningV = dyn(() => import('../pages/PlanningV'))
const TasksV = dyn(() => import('../pages/TasksV'))
const ContactsV = dyn(() => import('../pages/ContactsV'))
const ReportsV = dyn(() => import('../pages/ReportsV'))
const OrdresServiceV = dyn(() => import('../pages/OrdresServiceV'))
const AIV = dyn(() => import('../pages/AIV'))
const PhotoReportsV = dyn(() => import('../pages/PhotoReportsV'))
import GlobalSearch from '../components/GlobalSearch'

// ═══════════════════════════════════════════
export default function AdminDashboard({ user, profile = null }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Aide clavier (déclenchée par « ? »)
  const [helpOpen, setHelpOpen] = useState(false);
  // Préfixe « g » en attente (style GitHub : g puis lettre = go to tab)
  const pendingGRef = useRef(null);
  const { addToast } = useToast();
  // Floating mic — logique extraite dans useFloatingMic hook
  const {
    listening: floatListening, transcript: floatTranscript,
    setTranscript: setFloatTranscript, toggle: toggleFloatMic,
    clear: clearFloatMic
  } = useFloatingMic({ onError: (msg) => addToast(msg, 'warning') });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // ─── Stage 1 : données critiques pour la landing DashboardV ───
        // chantiers + tasks + ordresService + compteRendus.
        // On lève `loading` dès que ces 4 répondent pour que l'utilisateur
        // voie le dashboard ~instantanément. Les données secondaires
        // (contacts, planning, rdv, attachments) arrivent en 2e temps
        // et hydratent silencieusement via un setData partiel.
        const critical = await SB.loadCritical()
        if (!alive) return
        if (critical.error) {
          setData(defaultData)
          setLoading(false)
          return
        }

        if (critical.chantiers.length === 0) {
          // Première connexion : seed puis rechargement complet.
          const seeded = await seedDemoData(supabase, defaultData)
          if (!alive) return
          if (seeded) {
            const freshAll = await SB.loadAll()
            if (!alive) return
            setData(freshAll.chantiers?.length > 0 ? freshAll : defaultData)
          } else {
            setData(defaultData)
          }
          setLoading(false)
          return
        }

        // Stage 1 : rendu immédiat (placeholder pour les secondaires)
        const { _demoIds, ...stage1 } = critical
        setData({ ...defaultData, ...stage1 })
        setLoading(false)

        // ─── Stage 2 : secondaires en arrière-plan ───
        // Ne bloque pas l'UI ; le setData fusionne quand ça arrive.
        SB.loadSecondary(_demoIds).then(secondary => {
          if (!alive) return
          setData(prev => ({ ...(prev || {}), ...secondary }))
        }).catch(() => { /* silencieux, data partielle acceptable */ })
      } catch (_) {
        if (alive) { setData(defaultData); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, []);

  // Reload data from Supabase
  const reload = useCallback(async () => {
    try {
      const sbData = await SB.loadAll();
      setData(sbData);
    } catch (e) {
      // silently fail — keep current data
    }
  }, []);

  // Legacy save
  const save = useCallback(async (d) => { setData(d); }, []);

  // Focus = élément à mettre en avant dans la page cible après navigation
  // (utilisé par la recherche globale). On utilise un timestamp "ts" pour
  // que re-cliquer sur le même résultat re-déclenche le useEffect côté page.
  // ⚠️ Doit être déclaré AVANT le early return `if (loading || !data)`
  // pour respecter les règles des hooks React.
  const [focus, setFocus] = useState(null);

  // ─── Liste des onglets (avec raccourcis clavier « g + lettre ») ───
  // Définie avant l'early return pour respecter les règles des hooks.
  const tabs = useMemo(() => [
    {key:"dashboard",label:"Tableau de bord",   icon:I.dashboard, sc:"d"},
    {key:"projects", label:"Chantiers",         icon:I.projects,  sc:"p"},
    {key:"os",       label:"Ordres de Service", icon:I.os,        sc:"o"},
    {key:"reports",  label:"Comptes Rendus",    icon:I.reports,   sc:"r"},
    {key:"tasks",    label:"Tâches",            icon:I.tasks,     sc:"t"},
    {key:"planning", label:"Planning",          icon:I.planning,  sc:"l"},
    {key:"contacts", label:"Contacts",          icon:I.contacts,  sc:"c"},
    {key:"photos",   label:"Reportage Photo",   icon:I.camera,    sc:"h"},
    {key:"qonto",    label:"Qonto",             icon:null,        sc:"q", isQonto:true},
    ...(profile?.role === 'admin' ? [{key:"admin",label:"🔒 Admin", icon:I.settings, sc:"s"}] : []),
    {key:"ai",       label:"Assistant IA",      icon:I.ai,        sc:"a"},
  ], [profile?.role]);

  // switchTab : utilisé par la recherche globale, les boutons et les raccourcis
  const switchTab = useCallback((k, id = null) => {
    setTab(k);
    setFocus(id ? { id, ts: Date.now() } : null);
    setSidebarOpen(false); // ferme toujours sur mobile, no-op sur desktop
  }, []);

  // ─── Persistance de l'onglet actif ───
  // sessionStorage (pas localStorage) : l'onglet survit au refresh mais se
  // reset quand on ferme l'app/l'onglet → on atterrit toujours sur Dashboard
  // au cold start, ce qui est le comportement attendu.
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? sessionStorage.getItem(LAST_TAB_KEY) : null;
      if (saved && tabs.some(t => t.key === saved)) setTab(saved);
    } catch { /* ignore */ }
  }, [tabs]);

  useEffect(() => {
    try { if (typeof window !== 'undefined') sessionStorage.setItem(LAST_TAB_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  // ─── Raccourcis clavier globaux ───
  // • « g » + lettre → aller à un onglet (style GitHub)
  // • « / »          → focus la recherche globale (Ctrl+K reste dispo)
  // • « ? »          → ouvrir/fermer l'aide clavier
  // • Escape         → fermer l'aide
  useEffect(() => {
    const isTyping = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };
    const clearPending = () => { pendingGRef.current = null; };
    const handler = (e) => {
      // Laisser passer les combos système
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Escape ferme l'aide (même depuis un champ)
      if (e.key === 'Escape' && helpOpen) { setHelpOpen(false); return; }
      if (isTyping(e.target)) return;

      // « ? » → toggle help (Shift + /)
      if (e.key === '?') { e.preventDefault(); setHelpOpen(o => !o); return; }
      // « / » → focus la recherche globale
      if (e.key === '/') {
        e.preventDefault();
        const input = document.querySelector('[data-global-search-input]');
        if (input) { input.focus(); input.select?.(); }
        return;
      }
      // Préfixe « g »
      if (pendingGRef.current) {
        const target = tabs.find(t => t.sc === e.key.toLowerCase());
        clearPending();
        if (target) { e.preventDefault(); switchTab(target.key); }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        pendingGRef.current = setTimeout(clearPending, 1500);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (pendingGRef.current) clearTimeout(pendingGRef.current);
    };
  }, [tabs, switchTab, helpOpen]);

  // ─── Prefetch de jsPDF après le premier render ───
  // Télécharge le chunk generators.js (~180 KB) en arrière-plan 2s après
  // que l'app soit chargée, pour que le premier clic sur un bouton PDF
  // soit instantané au lieu d'attendre le download du chunk.
  // Silent fail : si le prefetch échoue (réseau instable), l'utilisateur
  // verra juste le comportement actuel au 1er clic.
  useEffect(() => {
    const t = setTimeout(() => {
      import('../generators').catch(() => { /* silent */ });
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  if (loading || !data) return <DashboardSkeleton role="admin" />;

  return (
    <div style={{
      display:"flex",height:"100vh",
      fontFamily:"var(--font-dm-sans), sans-serif",
      background:"#F1F5F9",overflow:"hidden"
    }}>
      {/* Skip link a11y : caché visuellement mais accessible au focus clavier */}
      <a href="#main-content" style={{
        position:"absolute",left:-9999,top:0,
        background:"#1E3A5F",color:"#fff",padding:"10px 16px",
        borderRadius:"0 0 8px 0",fontSize:13,fontWeight:600,
        textDecoration:"none",zIndex:10001,
      }}
      onFocus={e => { e.currentTarget.style.left = "0" }}
      onBlur={e => { e.currentTarget.style.left = "-9999px" }}
      >Passer au contenu principal</a>
      <style>{`
@keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes heartbeat{
          0%,100%{transform:scale(1)}15%{transform:scale(1.18)}
          30%{transform:scale(1)}45%{transform:scale(1.12)}60%{transform:scale(1)}
        }
        @keyframes ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}
        @keyframes neonBreathing{
          0%,100%{
            box-shadow:0 0 12px rgba(0,255,136,0.3),
              0 0 30px rgba(0,255,136,0.15),0 0 60px rgba(0,255,136,0.07);
            border-color:rgba(0,255,136,0.3)
          }
          50%{
            box-shadow:0 0 18px rgba(0,255,136,0.5),
              0 0 45px rgba(0,255,136,0.25),0 0 90px rgba(0,255,136,0.12);
            border-color:rgba(0,255,136,0.5)
          }
        }
        @keyframes neonRing{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}
        @keyframes neonPulse{0%,100%{opacity:1;box-shadow:0 0 3px #00FF88}50%{opacity:0.5;box-shadow:0 0 8px #00FF88}}
        @keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,0.3)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important;outline:none}
        /* A11y : focus ring clavier uniquement (pas sur les clics souris) */
        :focus{outline:none}
        :focus-visible{outline:2px solid #3B82F6 !important;outline-offset:2px;border-radius:4px}
        button:focus-visible,a:focus-visible,
        [role="button"]:focus-visible{outline:2px solid #3B82F6 !important;outline-offset:2px}
        /* Respect prefers-reduced-motion : désactive les animations décoratives */
        @media (prefers-reduced-motion: reduce){
          *,*::before,*::after{
            animation-duration:.01ms !important;
            animation-iteration-count:1 !important;
            transition-duration:.01ms !important
          }
        }
        /* Mobile : inputs à 16px minimum pour éviter l'auto-zoom iOS Safari */
        @media (max-width: 768px){
          input:not([type="checkbox"]):not([type="radio"]),select,textarea{font-size:16px !important}
          /* Touch targets minimum 36px sur mobile pour les boutons d'action */
          button:not([aria-label="Copier"]):not([aria-label="Fermer"]):not([aria-label="Fermer la notification"]):not([data-nav]){min-height:36px}
        }
      `}</style>

      {/* MOBILE OVERLAY */}
      {isMobile && sidebarOpen && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:998
        }} onClick={()=>setSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <nav aria-label="Navigation principale" style={{
        width:280,position:isMobile?"fixed":"relative",
        left:isMobile?(sidebarOpen?0:-300):0,top:0,bottom:0,
        background:"linear-gradient(195deg,#0F172A,#1E3A5F)",
        color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
        zIndex:999,transition:"left .25s ease",
        boxShadow:isMobile&&sidebarOpen?"4px 0 24px rgba(0,0,0,0.35)":"none"
      }}>
        <div style={{padding:"16px 16px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:17,fontWeight:700}}>ID MAÎTRISE</div>
          <div style={{
            fontSize:10,color:"#94A3B8",marginTop:2,letterSpacing:"0.05em"
          }}>MAÎTRISE D'ŒUVRE • LE HAVRE</div>
        </div>
        <GlobalSearch data={data} onNavigate={switchTab} />
        <div style={{flex:1,padding:"6px 8px",display:"flex",flexDirection:"column",gap:1,overflow:"auto"}}>
          {tabs.map(t=>{
            const active = tab===t.key;
            // Couleur d'accent : bleu pour tout, violet pour Qonto (distinction API)
            const accent = t.isQonto ? "#A78BFA" : "#60A5FA";
            return (
              <button
                key={t.key}
                data-nav
                onClick={()=>switchTab(t.key)}
                title={`${t.label} (g ${t.sc})`}
                aria-current={active ? "page" : undefined}
                aria-label={`${t.label}, raccourci g puis ${t.sc}`}
                style={{
                position:"relative",
                display:"flex",alignItems:"center",gap:9,
                padding:"7px 11px 7px 14px",border:"none",
                borderRadius:7,cursor:"pointer",
                fontFamily:"inherit",fontSize:12.5,
                fontWeight:active?600:400,
                color:active?"#fff":"#94A3B8",
                background:active?"rgba(255,255,255,0.10)":"transparent",
                transition:"background .15s, color .15s",textAlign:"left",width:"100%",
              }}
              onMouseEnter={e=>{ if(!active) e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
              onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}>
                {/* Barre d'accent verticale, uniforme sur tous les onglets actifs */}
                <span aria-hidden style={{
                  position:"absolute",left:4,top:8,bottom:8,width:3,borderRadius:2,
                  background:active?accent:"transparent",transition:"background .15s"
                }}/>
                {t.isQonto ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="2"/>
                    <path d="M15 15l3 3" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 12l2 2 4-4" stroke={accent} strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <Icon d={t.icon} size={16} color={active?accent:"#64748B"}/>
                )}
                <span style={{flex:1}}>{t.label}</span>
                {t.isQonto && (
                  <span style={{
                    display:"inline-flex",alignItems:"center",gap:3,
                    padding:"2px 7px",borderRadius:5,
                    background:"linear-gradient(135deg,#7C3AED,#A855F7)",
                    color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"
                  }}>API</span>
                )}
              </button>
            );
          })}
        </div>
        {/* User info + Logout */}
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {user && (
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {user.user_metadata?.avatar_url && (
                <Image src={user.user_metadata.avatar_url}
                  width={28} height={28} unoptimized alt=""
                  style={{
                    borderRadius:"50%",
                    border:"2px solid rgba(255,255,255,0.15)"
                  }}/>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{
                  fontSize:11,fontWeight:600,color:"#fff",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{
                  fontSize:9,color:"#64748B",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={logout} style={{
            width:"100%",padding:"6px 10px",borderRadius:6,
            border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.05)",
            color:"#94A3B8",fontSize:10,cursor:"pointer",
            fontFamily:"inherit",fontWeight:500
          }}>
            Déconnexion
          </button>
          <div style={{fontSize:9,color:"#475569",marginTop:6}}>
            SARL ID MAITRISE<br/>9 Rue Henry Genestal, 76600 Le Havre
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      {/* overflowX: hidden + minWidth: 0 → empêche le débordement horizontal
          quand un enfant est trop large (sécurité contre les bugs de layout
          flex sur mobile) */}
      <main id="main-content" aria-label="Contenu principal" style={{
        flex:1,minWidth:0,overflowX:"hidden",overflowY:"auto",
        padding:isMobile?16:24,paddingTop:isMobile?60:24
      }}>
        {/* MOBILE HEADER */}
        {isMobile && (
          <div style={{
            position:"fixed",top:0,left:0,right:0,height:52,
            background:"#fff",borderBottom:"1px solid #E2E8F0",
            display:"flex",alignItems:"center",padding:"0 12px",
            zIndex:997,gap:10,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"
          }}>
            <button onClick={()=>setSidebarOpen(s=>!s)} aria-label="Ouvrir le menu"
              style={{
                background:"none",border:"none",cursor:"pointer",fontSize:22,
                color:"#334155",padding:"6px 8px",borderRadius:6,lineHeight:1,
              }}>☰</button>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",lineHeight:1.15}}>
              <span style={{
                fontSize:10,fontWeight:600,color:"#94A3B8",
                letterSpacing:"0.06em",textTransform:"uppercase"
              }}>ID Maîtrise</span>
              <span style={{
                fontSize:15,fontWeight:700,color:"#0F172A",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
              }}>
                {tabs.find(t=>t.key===tab)?.label}
              </span>
            </div>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>switchTab(nextTab)} isMobile />
          </div>
        )}
        {!isMobile && (
          <div style={{position:"fixed",top:12,right:24,zIndex:998}}>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>switchTab(nextTab)} />
          </div>
        )}
        <div style={{animation:"fadeIn .3s ease",maxWidth:1200}}>
          {tab==="dashboard"&&<DashboardV data={data} setTab={switchTab} m={isMobile} user={user}/>}
          {tab==="qonto"&&<QontoV m={isMobile} data={data} reload={reload}/>}
          {tab==="projects"&&<ProjectsV data={data} save={save} m={isMobile}
            reload={reload} user={user} profile={profile}
            focusId={focus?.id} focusTs={focus?.ts}/>}
          {tab==="planning"&&<PlanningV data={data} m={isMobile}/>}
          {tab==="tasks"&&<TasksV data={data} save={save} m={isMobile}
            reload={reload} focusId={focus?.id} focusTs={focus?.ts}/>}
          {tab==="contacts"&&<ContactsV data={data} save={save} m={isMobile}
            reload={reload} focusId={focus?.id} focusTs={focus?.ts}/>}
          {tab==="reports"&&<ReportsV data={data} save={save} m={isMobile}
            reload={reload} focusId={focus?.id} focusTs={focus?.ts}/>}
          {tab==="os"&&<OrdresServiceV data={data} m={isMobile}
            reload={reload} focusId={focus?.id} focusTs={focus?.ts}/>}
          {tab==="photos"&&<PhotoReportsV data={data} m={isMobile} reload={reload}/>}
          {tab==="admin"&&<AdminV m={isMobile} reload={reload} profile={profile}/>}
          {tab==="ai"&&<AIV data={data} save={save} m={isMobile}
            externalTranscript={floatTranscript}
            clearExternal={()=>setFloatTranscript("")} reload={reload}/>}
        </div>
      </main>

      {/* FLOATING NEON MIC — visible on ALL tabs */}
      {tab !== "ai" && (
        <FloatingMic
          listening={floatListening}
          onClick={toggleFloatMic}
          transcript={floatTranscript}
          isMobile={isMobile}
          onSend={() => { setTab("ai"); }}
          onClear={clearFloatMic}
        />
      )}

      {/* KEYBOARD SHORTCUTS HELP — déclenché par « ? » */}
      <KeyboardHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} tabs={tabs} />
    </div>
  );
}
