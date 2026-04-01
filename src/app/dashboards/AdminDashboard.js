'use client'
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from '../supabaseClient'
import { logout } from '../auth'
import { FloatingMic } from '../components'

import { SB, defaultData, I, Icon, ApiBadge } from './shared'

import AdminV from '../pages/AdminV'
import DashboardV from '../pages/DashboardV'
import QontoV from '../pages/QontoV'
import ProjectsV from '../pages/ProjectsV'
import PlanningV from '../pages/PlanningV'
import TasksV from '../pages/TasksV'
import ContactsV from '../pages/ContactsV'
import ReportsV from '../pages/ReportsV'
import OrdresServiceV from '../pages/OrdresServiceV'
import AIV from '../pages/AIV'
import GoogleCalendarV from '../pages/GoogleCalendarV'

// ═══════════════════════════════════════════
export default function AdminDashboard({ user, profile = null }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Floating mic state
  const [floatListening, setFloatListening] = useState(false);
  const [floatTranscript, setFloatTranscript] = useState("");
  const floatRecogRef = useRef(null);

  const toggleFloatMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Reconnaissance vocale non supportée. Utilisez Chrome ou Safari."); return; }
    if (floatListening && floatRecogRef.current) {
      floatRecogRef.current.stop(); setFloatListening(false); return;
    }
    const r = new SR(); r.lang = "fr-FR"; r.continuous = true; r.interimResults = true;
    floatRecogRef.current = r; let final = "";
    r.onstart = () => { setFloatListening(true); setFloatTranscript(""); };
    r.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
        else interim = ev.results[i][0].transcript;
      }
      setFloatTranscript(final + interim);
    };
    r.onerror = () => setFloatListening(false);
    r.onend = () => { setFloatListening(false); if (final.trim()) setFloatTranscript(final.trim()); };
    r.start();
  }, [floatListening]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const sbData = await SB.loadAll();
        if (sbData.error) {
          setData(defaultData);
          setLoading(false);
          return;
        }
        const hasData = sbData.chantiers.length > 0;

        if (hasData) {
          setData(sbData);
        } else {
          // Seed données de démonstration (première connexion)
          let insertedChIds = [];
          try {
            const chantierRows = defaultData.chantiers.map(({ id, dateDebut, dateFin, ...rest }) => ({
              ...rest, date_debut: dateDebut || null, date_fin: dateFin || null
            }));
            const { data: insertedCh, error: errCh } = await supabase.from('chantiers').insert(chantierRows).select();
            if (errCh) throw new Error("Erreur insert chantiers: " + errCh.message);
            insertedChIds = (insertedCh || []).map(c => c.id);

            const contactRows = defaultData.contacts.map(({ id, chantiers, ...rest }) => rest);
            const { error: errCo } = await supabase.from('contacts').insert(contactRows).select();
            if (errCo) throw new Error("Erreur insert contacts: " + errCo.message);

            // Map ancien id → nouveau UUID pour lier les tâches
            const chMap = {};
            if (insertedCh) {
              defaultData.chantiers.forEach((defCh, i) => {
                if (insertedCh[i]) chMap[defCh.id] = insertedCh[i].id;
              });
            }

            const taskRows = defaultData.tasks.map(({ id, chantierId, ...rest }) => ({
              ...rest, chantier_id: chMap[chantierId] || null
            })).filter(t => t.chantier_id);
            if (taskRows.length > 0) {
              const { error: errTa } = await supabase.from('taches').insert(taskRows);
              if (errTa) throw new Error("Erreur insert tâches: " + errTa.message);
            }

            if (defaultData.compteRendus) {
              const crRows = defaultData.compteRendus.map(({ id, chantierId, ...rest }) => ({
                ...rest, chantier_id: chMap[chantierId] || null
              })).filter(c => c.chantier_id);
              if (crRows.length > 0) {
                const { error: errCr } = await supabase.from('compte_rendus').insert(crRows);
                if (errCr) throw new Error("Erreur insert CR: " + errCr.message);
              }
            }

            const freshData = await SB.loadAll();
            setData(freshData.chantiers.length > 0 ? freshData : defaultData);
          } catch (seedErr) {
            // Rollback : supprimer les chantiers insérés pour ne pas laisser la base à moitié remplie
            if (insertedChIds.length > 0) {
              await supabase.from('chantiers').delete().in('id', insertedChIds).catch(() => {});
            }
            console.error("Seed échoué, rollback effectué:", seedErr.message);
            setData(defaultData);
          }
        }
      } catch (e) {
        setData(defaultData);
      }
      setLoading(false);
    })();
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

  if (loading || !data) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:48,height:48,border:"4px solid #E2E8F0",borderTopColor:"#1E3A5F",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    </div>
  );

  const tabs = [
    {key:"dashboard",label:"Tableau de bord",icon:I.dashboard},
    {key:"projects",label:"Chantiers",icon:I.projects},
    {key:"os",label:"Ordres de Service",icon:I.reports},
    {key:"reports",label:"Comptes Rendus",icon:I.reports},
    {key:"tasks",label:"Tâches",icon:I.tasks},
    {key:"planning",label:"Planning",icon:I.planning},
    {key:"contacts",label:"Annuaire",icon:I.contacts},
    {key:"gcal",label:"Agenda",icon:null,isGcal:true},
    {key:"qonto",label:"Qonto",icon:null,isQonto:true},
    ...(profile?.role === 'admin' ? [{key:"admin",label:"🔒 Admin",icon:I.settings}] : []),
    {key:"ai",label:"Assistant IA",icon:I.ai},
  ];

  const switchTab = (k) => { setTab(k); if (isMobile) setSidebarOpen(false); };

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:"#F1F5F9",overflow:"hidden"}}>
      <style>{`
@keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}45%{transform:scale(1.12)}60%{transform:scale(1)}}
        @keyframes ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}
        @keyframes neonBreathing{0%,100%{box-shadow:0 0 12px rgba(0,255,136,0.3),0 0 30px rgba(0,255,136,0.15),0 0 60px rgba(0,255,136,0.07);border-color:rgba(0,255,136,0.3)}50%{box-shadow:0 0 18px rgba(0,255,136,0.5),0 0 45px rgba(0,255,136,0.25),0 0 90px rgba(0,255,136,0.12);border-color:rgba(0,255,136,0.5)}}
        @keyframes neonRing{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}
        @keyframes neonPulse{0%,100%{opacity:1;box-shadow:0 0 3px #00FF88}50%{opacity:0.5;box-shadow:0 0 8px #00FF88}}
        @keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,0.3)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important;outline:none}
      `}</style>

      {/* MOBILE OVERLAY */}
      {isMobile && sidebarOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:998}} onClick={()=>setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <nav style={{
        width:isMobile?260:240,position:isMobile?"fixed":"relative",left:isMobile?(sidebarOpen?0:-280):0,top:0,bottom:0,
        background:"linear-gradient(195deg,#0F172A,#1E3A5F)",color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
        zIndex:999,transition:"left .3s ease",boxShadow:isMobile&&sidebarOpen?"4px 0 20px rgba(0,0,0,0.3)":"none"
      }}>
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:18,fontWeight:700}}>ID MAÎTRISE</div>
          <div style={{fontSize:10,color:"#94A3B8",marginTop:2,letterSpacing:"0.05em"}}>MAÎTRISE D'ŒUVRE • LE HAVRE</div>
        </div>
        <div style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>switchTab(t.key)} style={{
              display:"flex",alignItems:"center",gap:9,padding:"9px 11px",border:"none",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:tab===t.key?600:400,
              color:tab===t.key?(t.isQonto?"#C4B5FD":"#fff"):(t.isQonto?"#A78BFA":"#94A3B8"),
              background:tab===t.key?(t.isQonto?"rgba(124,58,237,0.15)":"rgba(255,255,255,0.12)"):"transparent",
              transition:"all .2s",textAlign:"left",width:"100%",
              borderLeft:t.isQonto&&tab===t.key?"3px solid #7C3AED":"3px solid transparent",
            }}>
              {t.isGcal ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={tab==="gcal"?"#60A5FA":"#64748B"} strokeWidth="2"/><path d="M3 10h18" stroke={tab==="gcal"?"#60A5FA":"#64748B"} strokeWidth="2"/><path d="M8 2v4M16 2v4" stroke={tab==="gcal"?"#60A5FA":"#64748B"} strokeWidth="2" strokeLinecap="round"/></svg>
                : t.isQonto ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#7C3AED" strokeWidth="2"/><path d="M15 15l3 3" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <Icon d={t.icon} size={16} color={tab===t.key?"#60A5FA":"#64748B"}/>}
              <span style={{flex:1}}>{t.label}</span>
              {t.isGcal && tab===t.key && <span style={{width:6,height:6,borderRadius:"50%",background:"#34D399",flexShrink:0}}/>}
              {t.isQonto && <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>}
            </button>
          ))}
        </div>
        {/* User info + Logout */}
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {user && (
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} style={{width:28,height:28,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)"}} alt=""/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{fontSize:9,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={logout} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#94A3B8",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>
            Déconnexion
          </button>
          <div style={{fontSize:9,color:"#475569",marginTop:6}}>SARL ID MAITRISE<br/>9 Rue Henry Genestal, 76600 Le Havre</div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={{flex:1,overflow:"auto",padding:isMobile?16:24,paddingTop:isMobile?60:24}}>
        {/* MOBILE HEADER */}
        {isMobile && (
          <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"#fff",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",padding:"0 16px",zIndex:997,gap:12}}>
            <button onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.menu} size={22} color="#0F172A"/></button>
            <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>ID Maîtrise</span>
            <span style={{fontSize:11,color:"#94A3B8",marginLeft:"auto"}}>{tabs.find(t=>t.key===tab)?.label}</span>
          </div>
        )}
        <div style={{animation:"fadeIn .3s ease",maxWidth:1200}}>
          {tab==="dashboard"&&<DashboardV data={data} setTab={switchTab} m={isMobile} user={user}/>}
          {tab==="qonto"&&<QontoV m={isMobile} data={data} reload={reload}/>}
          {tab==="projects"&&<ProjectsV data={data} save={save} m={isMobile} reload={reload} user={user} profile={profile}/>}
          {tab==="planning"&&<PlanningV data={data} m={isMobile}/>}
          {tab==="tasks"&&<TasksV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="contacts"&&<ContactsV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="reports"&&<ReportsV data={data} save={save} m={isMobile} reload={reload}/>}
          {tab==="os"&&<OrdresServiceV data={data} m={isMobile} reload={reload}/>}
          {tab==="admin"&&<AdminV m={isMobile} reload={reload} profile={profile}/>}
          {tab==="gcal"&&<GoogleCalendarV m={isMobile}/>}
          {tab==="ai"&&<AIV data={data} save={save} m={isMobile} externalTranscript={floatTranscript} clearExternal={()=>setFloatTranscript("")} reload={reload}/>}
        </div>
      </main>

      {/* FLOATING NEON MIC — visible on ALL tabs */}
      {tab !== "ai" && (
        <FloatingMic
          listening={floatListening}
          onClick={toggleFloatMic}
          transcript={floatTranscript}
          isMobile={isMobile}
          onSend={() => { setTab("ai"); /* transcript will be picked up by AIV */ }}
          onClear={() => { setFloatTranscript(""); if (floatListening && floatRecogRef.current) { floatRecogRef.current.stop(); setFloatListening(false); } }}
        />
      )}
    </div>
  );
}
