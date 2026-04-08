'use client'
import { pct, fmtMoney, phase, status, PBar, COMPANY } from '../dashboards/shared'

export default function DashboardV({data,setTab,m,user}) {
  const today = new Date().toISOString().split("T")[0];
  const urgentTasks = data.tasks.filter(t=>t.priorite==="Urgent"&&t.statut!=="Terminé");
  const allActiveTasks = data.tasks
    .filter(t=>t.statut!=="Terminé")
    .sort((a,b)=>{
      const pri = {Urgent:0,"En cours":1,"En attente":2};
      if ((pri[a.priorite]??9) !== (pri[b.priorite]??9)) return (pri[a.priorite]??9)-(pri[b.priorite]??9);
      return new Date(a.echeance||"9999")-new Date(b.echeance||"9999");
    });
  const chantiersEnCours = data.chantiers.filter(c=>c.statut==="En cours").sort((a,b)=>new Date(b.date_debut||0)-new Date(a.date_debut||0)).slice(0,3);
  const totalB = data.chantiers.reduce((s,c)=>s+(Number(c.budget)||0),0);
  const totalD = data.chantiers.reduce((s,c)=>s+(Number(c.depenses)||0),0);
  const enCours = data.chantiers.filter(c=>c.statut==="En cours").length;

  return (<div>
    {/* HEADER */}
    <div style={{marginBottom:24}}>
      <h1 style={{margin:0,fontSize:m?22:28,fontWeight:700,color:"#0F172A"}}>Bonjour {user?.user_metadata?.full_name?.split(" ")[0] || COMPANY.gerant}</h1>
      <p style={{margin:"6px 0 0",color:"#64748B",fontSize:m?12:13}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
    </div>

    {/* ACTIONS RAPIDES */}
    <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:24}}>
      {[
        {label:"Nouvel OS",icon:"📋",tab:"os"},
        {label:"Nouveau CR",icon:"📝",tab:"reports"},
        {label:"Nouvelle tâche",icon:"✓",tab:"tasks"},
        {label:"Nouveau chantier",icon:"🏗️",tab:"projects"},
      ].map((a,i)=>(
        <button key={i} onClick={()=>setTab(a.tab)} style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:10,padding:12,cursor:"pointer",transition:"all .15s",textAlign:"center",fontWeight:600,fontSize:12,color:"#0F172A",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <span style={{fontSize:20}}>{a.icon}</span>{a.label}
        </button>
      ))}
    </div>

    {/* CHANTIERS EN COURS */}
    {chantiersEnCours.length>0&&(
      <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#0F172A"}}>Chantiers en cours</h2>
          <button onClick={()=>setTab("projects")} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Voir tous →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(3,1fr)",gap:12}}>
          {chantiersEnCours.map(ch=>{
            const ratio=pct(ch.depenses,ch.budget);
            const budgetColor=ratio>85?"#EF4444":ratio>60?"#F59E0B":"#10B981";
            return(
              <div key={ch.id} onClick={()=>setTab("projects")} style={{border:`2px solid ${phase[ch.phase]||"#E2E8F0"}`,borderRadius:10,padding:12,cursor:"pointer",background:"#FAFAFA",transition:"all .15s",":hover":{boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}}>
                <div style={{marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#0F172A",marginBottom:2}}>{ch.nom}</div>
                  <div style={{fontSize:11,color:"#64748B"}}>{ch.client}</div>
                </div>
                <PBar value={ch.depenses} max={ch.budget} color={budgetColor}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,color:"#94A3B8"}}>
                  <span><span style={{fontWeight:600,color:budgetColor}}>{ratio}%</span> dépensé</span>
                  <span>{fmtMoney(ch.depenses)} / {fmtMoney(ch.budget)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* À FAIRE AUJOURD'HUI */}
    <div style={{marginBottom:20}}>
      {/* TÂCHES URGENTES */}
      <div style={{background:"#FEF2F2",borderRadius:14,padding:m?14:18,border:"1.5px solid #FECACA"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:"#0F172A"}}>⚡ À faire</span>
          {urgentTasks.length>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{urgentTasks.length}</span>}
        </div>
        {allActiveTasks.length===0
          ? <p style={{color:"#94A3B8",fontSize:12,margin:0}}>Aucune tâche</p>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {allActiveTasks.slice(0,5).map(t=>{
                const ch=data.chantiers.find(c=>c.id===(t.chantierId||t.chantier_id));
                const isUrgent=t.priorite==="Urgent";
                return(
                  <div key={t.id} onClick={()=>setTab("tasks")} style={{cursor:"pointer",paddingBottom:8,borderBottom:"1px solid #F1F5F9"}}>
                    <div style={{fontSize:12,fontWeight:isUrgent?700:600,color:isUrgent?"#EF4444":"#0F172A"}}>{isUrgent?"⚠ ":""}{t.titre}</div>
                    <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{ch?.nom}</div>
                  </div>
                );
              })}
              {allActiveTasks.length>5&&<button onClick={()=>setTab("tasks")} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600,marginTop:4}}>Voir les {allActiveTasks.length-5} autres →</button>}
            </div>
        }
      </div>
    </div>

    {/* STATISTIQUES */}
    <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
      <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0F172A"}}>Vue d'ensemble</h3>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(2,1fr)",gap:16}}>
        <div style={{paddingRight:m?0:16,borderRight:m?"none":"1px solid #E2E8F0"}}>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Chantiers actifs</div>
          <div style={{fontSize:m?28:32,fontWeight:700,color:"#3B82F6",marginBottom:8}}>{enCours}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",background:"#3B82F6",width:enCours/(data.chantiers.length||1)*100+"%"}}/>
            </div>
            <span style={{fontSize:10,color:"#64748B"}}>{enCours}/{data.chantiers.length}</span>
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Budget</div>
          <div style={{fontSize:m?24:28,fontWeight:700,color:"#10B981",marginBottom:8}}>{fmtMoney(totalB)}</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748B"}}>
            <span>Dépensé: <span style={{fontWeight:600}}>{fmtMoney(totalD)}</span></span>
            <span style={{color:pct(totalD,totalB)>85?"#EF4444":pct(totalD,totalB)>60?"#F59E0B":"#10B981",fontWeight:600}}>{pct(totalD,totalB)}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>);
}
