'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { supabase } from '../supabaseClient'
import { logout } from '../auth'
import { NotificationBell } from '../components'
import { FLOATING_MIC_CLEARANCE } from '../components/FloatingMic'
import { PageSkeleton } from '../components/Skeleton'
import DashboardLoadState from '../components/DashboardLoadState'
import TabErrorBoundary from '../components/TabErrorBoundary'
import KeyboardHelpModal from '../components/KeyboardHelpModal'
import MobileNav, { QuickCreateSheet, MOBILE_NAV_HEIGHT } from '../components/MobileNav'
import LeaveGuardNotice from '../components/LeaveGuardNotice'
import { newIntent } from '../lib/navIntent'
import DashboardMic from '../components/DashboardMic'
import { useDashboardData } from '../hooks/useDashboardData'
import { useCrmData } from '../hooks/useCrmData'
import { seedDemoData } from '../lib/seedDemoData'

import { defaultData, I, Icon } from './shared'

// Lazy-load des pages : chaque page devient son propre chunk et n'est
// téléchargée qu'au premier affichage de l'onglet correspondant.
// Gain : bundle initial réduit de ~60-80% (on n'embarque plus 8 pages au démarrage).
const dyn = (loader) => dynamic(loader, { loading: PageSkeleton, ssr: false })

// Clé localStorage pour la persistance de l'onglet actif (survit au refresh)
const LAST_TAB_KEY = 'idm_admin_tab'

// Table loader-par-onglet : garde une référence vers le dynamic import
// pour qu'on puisse le preload() au survol du bouton (précharge le chunk
// JS AVANT que l'utilisateur clique → pas de latence réseau au switch).
const PAGE_LOADERS = {
  admin:     () => import('../pages/AdminV'),
  dashboard: () => import('../pages/DashboardV'),
  qonto:     () => import('../pages/QontoV'),
  projects:  () => import('../pages/ProjectsV'),
  planning:  () => import('../pages/PlanningV'),
  tasks:     () => import('../pages/TasksV'),
  contacts:  () => import('../pages/ContactsV'),
  crm:       () => import('../pages/CrmV'),
  reports:   () => import('../pages/ReportsV'),
  os:        () => import('../pages/OrdresServiceV'),
  ai:        () => import('../pages/AIV'),
  photos:    () => import('../pages/PhotoReportsV'),
}
const AdminV         = dyn(PAGE_LOADERS.admin)
const QontoV         = dyn(PAGE_LOADERS.qonto)
const ProjectsV      = dyn(PAGE_LOADERS.projects)
const PlanningV      = dyn(PAGE_LOADERS.planning)
const TasksV         = dyn(PAGE_LOADERS.tasks)
const ContactsV      = dyn(PAGE_LOADERS.contacts)
const CrmV           = dyn(PAGE_LOADERS.crm)
const ReportsV       = dyn(PAGE_LOADERS.reports)
const OrdresServiceV = dyn(PAGE_LOADERS.os)
const AIV            = dyn(PAGE_LOADERS.ai)
const PhotoReportsV  = dyn(PAGE_LOADERS.photos)
import GlobalSearch from '../components/GlobalSearch'
// L'accueil est le premier écran affiché : importé directement (pas de
// second chargement ni de second squelette au démarrage).
import DashboardV from '../pages/DashboardV'

// ═══════════════════════════════════════════
export default function AdminDashboard({ user, profile = null }) {
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Aide clavier (déclenchée par « ? »)
  const [helpOpen, setHelpOpen] = useState(false);
  // Menu « Créer » (bouton + mobile, bouton sidebar, touche « c »)
  const [createOpen, setCreateOpen] = useState(false);
  // Préfixe « g » en attente (style GitHub : g puis lettre = go to tab)
  const pendingGRef = useRef(null);
  // Texte dicté au micro flottant, transmis à l'assistant IA à l'envoi
  const [micText, setMicText] = useState("");
  const clearMicText = useCallback(() => setMicText(""), []);
  const sendMicText = useCallback((t) => { setMicText(t || ""); setTab("ai"); }, []);

  // ─── Data layer via React Query ───
  // useDashboardData encapsule le stage-1 (critical) et le stage-2
  // (secondary) avec cache staleTime 5 min. Avant on avait un useEffect
  // qui refetch à chaque mount ; maintenant la nav entre onglets est
  // instantanée tant que la cache est fresh.
  const { data: loadedData, loading, error: loadError, paused: loadPaused, reload, hasChantiers, secondaryReady } = useDashboardData();
  // Stage 3 : CRM (pipeline + interactions), lancé seulement après le
  // stage 1. Partagé via React Query par CrmV, DashboardV, ContactsV,
  // QontoV, AIV et la recherche globale.
  const { crm, reload: reloadCrm, ready: crmReady } = useCrmData({ enabled: !!loadedData });

  // Seed premier login : si la DB est vide après le 1er fetch, on sème
  // les données de démo une seule fois, puis on invalide la query.
  // Garde-fou via `seededRef` pour ne pas relancer si l'utilisateur
  // supprime tout ses chantiers (comportement voulu = rester vide).
  const seededRef = useRef(false);
  useEffect(() => {
    if (hasChantiers !== false || seededRef.current) return;
    seededRef.current = true;
    (async () => {
      try {
        const seeded = await seedDemoData(supabase, defaultData);
        if (seeded) reload();
      } catch { /* silent : seed best-effort */ }
    })();
  }, [hasChantiers, reload]);

  // Fallback visuel : si critical error OU pas encore chargé, on garde null
  // (skeleton s'affiche). Après 1er load, on expose toujours un objet data.
  const data = loadedData;

  // Compat prop legacy `save` : certaines pages passent un setter partiel.
  // Avec React Query on préfère invalider la query et laisser refetch.
  const save = useCallback(async () => { await reload(); }, [reload]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  // Focus = élément à mettre en avant dans la page cible après navigation
  // (utilisé par la recherche globale). On utilise un timestamp "ts" pour
  // que re-cliquer sur le même résultat re-déclenche le useEffect côté page.
  // Le focus n'est transmis qu'à l'onglet actif : les onglets déjà visités
  // restent montés, et une intention « new » ne doit ouvrir qu'UN formulaire.
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
    {key:"crm",      label:"CRM",               icon:I.crm,       sc:"v"},
    {key:"photos",   label:"Reportage Photo",   icon:I.camera,    sc:"h"},
    {key:"qonto",    label:"Qonto",             icon:null,        sc:"q", isQonto:true},
    ...(profile?.role === 'admin' ? [{key:"admin",label:"Admin", icon:I.settings, sc:"s"}] : []),
    {key:"ai",       label:"Assistant IA",      icon:I.ai,        sc:"a"},
  ], [profile?.role]);

  const openTab = useCallback((k, id = null) => {
    setTab(k);
    setFocus(id ? { id, ts: Date.now() } : null);
    setSidebarOpen(false); // ferme toujours sur mobile, no-op sur desktop
  }, []);

  // Pages d'origine des liens suivis (tableau de bord → fiche CRM…) :
  // la flèche retour y ramène au lieu de laisser sur la page d'arrivée.
  const [backStack, setBackStack] = useState([]);
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // switchTab : menu, barre mobile, raccourcis → on repart de zéro
  const switchTab = useCallback((k, id = null) => {
    setBackStack([]);
    openTab(k, id);
  }, [openTab]);

  // jumpTo : lien depuis une page ou la recherche → mémorise la page d'origine
  const jumpTo = useCallback((k, id = null) => {
    const from = tabRef.current;
    if (from !== k) setBackStack(s => [...s, from].slice(-10));
    openTab(k, id);
  }, [openTab]);

  const goBack = useCallback(() => {
    if (!backStack.length) return;
    setBackStack(backStack.slice(0, -1));
    openTab(backStack[backStack.length - 1]);
  }, [backStack, openTab]);

  // Transmis aux pages qui ouvrent une fiche à l'arrivée : la fermer ramène
  // à la page d'origine
  const back = useMemo(() => {
    if (!backStack.length) return null;
    const key = backStack[backStack.length - 1];
    return { label: tabs.find(t => t.key === key)?.label || 'Retour', go: goBack };
  }, [backStack, tabs, goBack]);

  // Actions du menu « Créer » : chacune ouvre directement le formulaire
  // de création de l'onglet cible (intention 'new', cf. lib/navIntent).
  const createActions = useMemo(() => [
    { key:'os',       icon:I.os, label:'Ordre de service', hint:'Commande artisan',    onPick:()=>switchTab('os', newIntent()) },
    { key:'reports',  icon:I.reports, label:'Compte rendu',     hint:'Réunion de chantier', onPick:()=>switchTab('reports', newIntent()) },
    { key:'tasks',    icon:I.tasks, label:'Tâche',            hint:'À faire / relance',   onPick:()=>switchTab('tasks', newIntent()) },
    { key:'photos',   icon:I.camera, label:'Reportage photo',  hint:'Photos du jour',      onPick:()=>switchTab('photos') },
    { key:'contacts', icon:I.contacts, label:'Contact',          hint:'Artisan, client…',    onPick:()=>switchTab('contacts', newIntent()) },
    { key:'crm',      icon:I.crm, label:'Affaire',          hint:'Prospect CRM',        onPick:()=>switchTab('crm', newIntent()) },
    { key:'projects', icon:I.projects, label:'Chantier',         hint:'Nouveau projet',      onPick:()=>switchTab('projects', newIntent()) },
  ], [switchTab]);

  // Onglets de la barre mobile (le reste est dans le menu « Plus »)
  const mobileNavItems = useMemo(() => [
    { key:'dashboard', label:'Accueil',   icon:I.dashboard },
    { key:'projects',  label:'Chantiers', icon:I.projects },
    { key:'reports',   label:'CR',        icon:I.reports },
    { key:'tasks',     label:'Tâches',    icon:I.tasks },
  ], []);

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

  // ─── Onglets visités : restent MONTÉS (display:none) après la première
  // visite pour éviter le re-mount + re-fetch à chaque retour.
  // Gain : navigation instantanée entre les onglets déjà vus.
  // Coût : un peu plus de RAM (quelques Mo, négligeable).
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));
  useEffect(() => {
    setVisitedTabs(prev => prev.has(tab) ? prev : new Set([...prev, tab]));
  }, [tab]);

  // Preload le chunk d'un onglet (au hover/focus du bouton de la sidebar).
  // next/dynamic expose .preload() sur les composants paresseux, mais on
  // peut aussi déclencher l'import() manuellement. Sans erreur si déjà chargé.
  const preloadTab = useCallback((key) => {
    const loader = PAGE_LOADERS[key];
    if (loader) loader().catch(() => { /* silencieux */ });
  }, []);

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
      // Pas de raccourci global quand une modale est ouverte
      if (document.querySelector('[role="dialog"]')) return;

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
      // « c » → menu Créer
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setCreateOpen(true); return; }
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

  // Pas encore de données : squelette, avec un avis si le réseau manque ou
  // si c'est long, et un écran d'erreur avec « Réessayer » si ça échoue.
  if (!data) return <DashboardLoadState role="admin" error={loading ? null : loadError} paused={loadPaused} onRetry={reload} />;

  return (
    <div style={{
      display:"flex",height:"100vh",
      fontFamily:"var(--font-dm-sans), sans-serif",
      background:"#F2F2F7",overflow:"hidden"
    }}>
      {/* Skip link a11y : caché visuellement mais accessible au focus clavier */}
      <a href="#main-content" style={{
        position:"absolute",left:-9999,top:0,
        background:"#0071E3",color:"#fff",padding:"10px 16px",
        borderRadius:"0 0 8px 0",fontSize:13,fontWeight:600,
        textDecoration:"none",zIndex:10001,
      }}
      onFocus={e => { e.currentTarget.style.left = "0" }}
      onBlur={e => { e.currentTarget.style.left = "-9999px" }}
      >Passer au contenu principal</a>
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#D1D1D6;border-radius:3px}
        @media (max-width: 768px){
          input:not([type="checkbox"]):not([type="radio"]),select,textarea{font-size:16px !important}
          button:not([aria-label="Copier"]):not([aria-label="Fermer"]):not([aria-label="Fermer la notification"]):not([data-nav]){min-height:36px}
        }
      `}</style>

      {/* MOBILE OVERLAY */}
      {isMobile && sidebarOpen && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:998
        }} onClick={()=>setSidebarOpen(false)} />
      )}

      {/* SIDEBAR — claire, façon barre latérale iPad : icônes bleues,
          onglet actif en pastille bleue */}
      <nav aria-label="Navigation principale" style={{
        width:280,position:isMobile?"fixed":"relative",
        left:isMobile?(sidebarOpen?0:-300):0,top:0,bottom:0,
        background:"#F9F9FB",borderRight:"1px solid #E5E5EA",
        color:"#1C1C1E",display:"flex",flexDirection:"column",flexShrink:0,
        zIndex:999,transition:"left .25s ease",
        boxShadow:isMobile&&sidebarOpen?"4px 0 24px rgba(0,0,0,0.15)":"none"
      }}>
        <div style={{padding:"18px 16px 10px"}}>
          <div style={{fontSize:20,fontWeight:700,letterSpacing:"-0.01em"}}>ID Maîtrise</div>
          <div style={{fontSize:12,color:"#6E6E73",marginTop:2}}>Maîtrise d&apos;œuvre · Le Havre</div>
        </div>
        <GlobalSearch data={data} crm={crm} onNavigate={jumpTo} />
        <div style={{padding:"4px 8px 8px"}}>
          <button onClick={()=>setCreateOpen(true)} title="Créer (raccourci : c)" className="u-btn" style={{
            width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            padding:"9px 10px",minHeight:38,borderRadius:10,border:"none",cursor:"pointer",
            background:"#0071E3",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:600,
          }}>
            <Icon d={I.plus} size={16} color="#fff"/> Créer…
          </button>
        </div>
        <div style={{flex:1,padding:"4px 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
          {tabs.map(t=>{
            const active = tab===t.key;
            // Icônes bleues ; Qonto en violet (données venues de l'API bancaire)
            const tint = t.isQonto ? "#AF52DE" : "#0071E3";
            const iconColor = active ? "#fff" : tint;
            return (
              <button
                key={t.key}
                data-nav
                data-active={active ? 'true' : 'false'}
                onClick={()=>switchTab(t.key)}
                onFocus={()=>preloadTab(t.key)}
                onMouseEnter={()=>preloadTab(t.key)}
                title={`${t.label} (g ${t.sc})`}
                aria-current={active ? "page" : undefined}
                aria-label={`${t.label}, raccourci g puis ${t.sc}`}
                className="sidebar-tab"
                style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"8px 10px",minHeight:38,border:"none",
                borderRadius:10,cursor:"pointer",
                fontFamily:"inherit",fontSize:15,
                fontWeight:active?600:400,
                color:active?"#fff":"#1C1C1E",
                background:active?"#0071E3":"transparent",
                textAlign:"left",width:"100%",
              }}>
                {t.isQonto ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke={iconColor} strokeWidth="2"/>
                    <path d="M15 15l3 3" stroke={iconColor} strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 12l2 2 4-4" stroke={iconColor} strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <Icon d={t.icon} size={18} color={iconColor}/>
                )}
                <span style={{flex:1}}>{t.label}</span>
                {t.isQonto && (
                  <span style={{
                    display:"inline-flex",alignItems:"center",
                    padding:"1px 6px",borderRadius:999,
                    background:active?"rgba(255,255,255,0.2)":"#AF52DE18",
                    color:active?"#fff":"#8944AB",fontSize:11,fontWeight:600,
                  }}>API</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Compte + déconnexion */}
        <div style={{padding:"12px 16px",borderTop:"1px solid #E5E5EA"}}>
          {user && (
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              {user.user_metadata?.avatar_url && (
                <Image src={user.user_metadata.avatar_url}
                  width={32} height={32} unoptimized alt=""
                  style={{ borderRadius:"50%" }}/>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{
                  fontSize:14,fontWeight:600,color:"#1C1C1E",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{
                  fontSize:12,color:"#6E6E73",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={logout} className="u-btn" style={{
            width:"100%",padding:"8px 10px",minHeight:36,borderRadius:10,
            border:"none",background:"#EFEFF0",
            color:"#D70015",fontSize:14,cursor:"pointer",
            fontFamily:"inherit",fontWeight:500
          }}>
            Déconnexion
          </button>
          <div style={{fontSize:11,color:"#6E6E73",marginTop:10,lineHeight:1.4}}>
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
        padding:isMobile?16:24,paddingTop:isMobile?60:24,
        // Réserve la place de la barre de navigation basse et de la bulle IA (+ safe-area iOS)
        paddingBottom:isMobile?`calc(${MOBILE_NAV_HEIGHT + 24 + (tab !== "ai" ? FLOATING_MIC_CLEARANCE : 0)}px + env(safe-area-inset-bottom))`:24
      }}>
        {/* MOBILE HEADER */}
        {isMobile && (
          <div style={{
            position:"fixed",top:0,left:0,right:0,height:52,
            // Barre translucide façon iOS
            background:"rgba(249,249,251,0.88)",
            backdropFilter:"saturate(180%) blur(20px)",WebkitBackdropFilter:"saturate(180%) blur(20px)",
            borderBottom:"1px solid rgba(0,0,0,0.1)",
            display:"flex",alignItems:"center",padding:"0 8px",
            zIndex:997,gap:6
          }}>
            <button onClick={()=>setSidebarOpen(s=>!s)} aria-label="Ouvrir le menu"
              className="u-icon-btn"
              style={{ width:40,height:40,borderRadius:10,color:"#0071E3" }}>
              <Icon d={I.menu} size={22} color="#0071E3"/>
            </button>
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",lineHeight:1.15}}>
              <span style={{
                fontSize:11,fontWeight:500,color:"#6E6E73",
              }}>ID Maîtrise</span>
              <span style={{
                fontSize:17,fontWeight:600,color:"#1C1C1E",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"
              }}>
                {tabs.find(t=>t.key===tab)?.label}
              </span>
            </div>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>jumpTo(nextTab)} isMobile />
          </div>
        )}
        {!isMobile && (
          <div style={{position:"fixed",top:12,right:24,zIndex:998}}>
            <NotificationBell userEmail={user?.email} onNavigate={(nextTab)=>jumpTo(nextTab)} />
          </div>
        )}
        <div style={{animation:"fadeInUp .3s cubic-bezier(.4, 0, .2, 1)",maxWidth:1200}}>
          {back && (
            <button type="button" onClick={back.go} style={{
              background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:12,
              display:"flex",alignItems:"center",gap:6,fontFamily:"inherit",
              color:"#0066CC",fontSize:15,fontWeight:500,minHeight:36,
            }}>
              ‹ {back.label}
            </button>
          )}
          {/* Chaque onglet n'est RENDU que s'il a déjà été visité (visitedTabs),
              et reste MONTÉ avec display:none quand il n'est pas actif.
              Avant, {tab==="x" && <XV/>} démontait la page précédente à chaque
              switch → re-mount + re-fetch des useEffect internes → latence.
              Maintenant, les useEffect des pages ne tournent qu'une fois. */}
          {visitedTabs.has('dashboard') && (
            <div style={{ display: tab === 'dashboard' ? 'block' : 'none' }}>
              <TabErrorBoundary name="dashboard" resetKey={data}>
                <DashboardV data={data} crm={crm} ready={secondaryReady && crmReady} setTab={jumpTo} m={isMobile} user={user}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('qonto') && (
            <div style={{ display: tab === 'qonto' ? 'block' : 'none' }}>
              <TabErrorBoundary name="qonto" resetKey={data}>
                <QontoV m={isMobile} data={data} reload={reload} crm={crm} reloadCrm={reloadCrm} setTab={jumpTo}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('projects') && (
            <div style={{ display: tab === 'projects' ? 'block' : 'none' }}>
              <TabErrorBoundary name="projects" resetKey={data}>
                <ProjectsV data={data} save={save} m={isMobile} active={tab === 'projects'}
                  reload={reload} user={user} profile={profile}
                  focusId={tab === 'projects' ? focus?.id : null} focusTs={focus?.ts}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('planning') && (
            <div style={{ display: tab === 'planning' ? 'block' : 'none' }}>
              <TabErrorBoundary name="planning" resetKey={data}>
                <PlanningV data={data} m={isMobile} reload={reload}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('tasks') && (
            <div style={{ display: tab === 'tasks' ? 'block' : 'none' }}>
              <TabErrorBoundary name="tasks" resetKey={data}>
                <TasksV data={data} save={save} m={isMobile} active={tab === 'tasks'}
                  reload={reload} focusId={tab === 'tasks' ? focus?.id : null} focusTs={focus?.ts} back={back}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('contacts') && (
            <div style={{ display: tab === 'contacts' ? 'block' : 'none' }}>
              <TabErrorBoundary name="contacts" resetKey={data}>
                <ContactsV data={data} save={save} m={isMobile} active={tab === 'contacts'}
                  reload={reload} focusId={tab === 'contacts' ? focus?.id : null} focusTs={focus?.ts}
                  crm={crm} reloadCrm={reloadCrm} setTab={jumpTo}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('crm') && (
            <div style={{ display: tab === 'crm' ? 'block' : 'none' }}>
              <TabErrorBoundary name="crm" resetKey={data}>
                <CrmV data={data} m={isMobile} reload={reload} setTab={jumpTo}
                  focusId={tab === 'crm' ? focus?.id : null} focusTs={focus?.ts} back={back}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('reports') && (
            <div style={{ display: tab === 'reports' ? 'block' : 'none' }}>
              <TabErrorBoundary name="reports" resetKey={data}>
                <ReportsV data={data} save={save} m={isMobile} active={tab === 'reports'}
                  reload={reload} focusId={tab === 'reports' ? focus?.id : null} focusTs={focus?.ts}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('os') && (
            <div style={{ display: tab === 'os' ? 'block' : 'none' }}>
              <TabErrorBoundary name="os" resetKey={data}>
                <OrdresServiceV data={data} m={isMobile} active={tab === 'os'}
                  reload={reload} focusId={tab === 'os' ? focus?.id : null} focusTs={focus?.ts}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('photos') && (
            <div style={{ display: tab === 'photos' ? 'block' : 'none' }}>
              <TabErrorBoundary name="photos" resetKey={data}>
                <PhotoReportsV data={data} m={isMobile} reload={reload}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('admin') && (
            <div style={{ display: tab === 'admin' ? 'block' : 'none' }}>
              <TabErrorBoundary name="admin" resetKey={data}>
                <AdminV m={isMobile} reload={reload} profile={profile}/>
              </TabErrorBoundary>
            </div>
          )}
          {visitedTabs.has('ai') && (
            <div style={{ display: tab === 'ai' ? 'block' : 'none' }}>
              <TabErrorBoundary name="ai" resetKey={data}>
                <AIV data={data} save={save} m={isMobile} active={tab === 'ai'}
                  externalTranscript={micText}
                  clearExternal={clearMicText} reload={reload}
                  crm={crm} reloadCrm={reloadCrm}/>
              </TabErrorBoundary>
            </div>
          )}
        </div>
      </main>

      {/* FLOATING NEON MIC — visible on ALL tabs */}
      {tab !== "ai" && (
        <DashboardMic isMobile={isMobile} bottomOffset={isMobile ? MOBILE_NAV_HEIGHT : 0} onSend={sendMicText} />
      )}

      {/* BARRE DE NAVIGATION BASSE (mobile) */}
      {isMobile && (
        <MobileNav items={mobileNavItems} active={tab} onSelect={switchTab}
          onMenu={()=>setSidebarOpen(true)} onCreate={()=>setCreateOpen(true)} />
      )}
      <QuickCreateSheet open={createOpen} onClose={()=>setCreateOpen(false)}
        actions={createActions} isMobile={isMobile} />

      {/* Message quand le retour du téléphone est bloqué (fenêtre de saisie ouverte) */}
      <LeaveGuardNotice />

      {/* KEYBOARD SHORTCUTS HELP — déclenché par « ? » */}
      <KeyboardHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} tabs={tabs} />
    </div>
  );
}
