'use client'
import { useState } from 'react'
import { phase, sel } from '../dashboards/shared'

export default function PlanningV({data,m}) {
  const [filter,setFilter]=useState("all");
  const items = filter==="all"?data.planning:data.planning.filter(p=>p.chantierId===filter||p.chantier_id===filter);

  if (!data.planning || data.planning.length === 0) {
    return (<div>
      <h1 style={{margin:"0 0 20px",fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        Aucune entrée de planning. Ajoutez des tâches planifiées depuis l'onglet Chantiers.
      </div>
    </div>);
  }

  const timestamps = data.planning.map(p=>new Date(p.debut).getTime()).filter(t=>!isNaN(t));
  const endTimestamps = data.planning.map(p=>new Date(p.fin).getTime()).filter(t=>!isNaN(t));
  if (timestamps.length === 0 || endTimestamps.length === 0) return null;

  const min=new Date(Math.min(...timestamps));
  const max=new Date(Math.max(...endTimestamps));
  const total=Math.max(Math.ceil((max-min)/864e5)+1, 1);

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <select style={{...sel,width:"auto"}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous</option>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>
    </div>
    <div style={{background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",overflowX:"auto"}}>
      {items.length === 0
        ? <div style={{textAlign:"center",color:"#94A3B8",padding:20,fontSize:13}}>Aucune tâche pour ce chantier.</div>
        : items.map(p=>{const ch=data.chantiers.find(c=>c.id===(p.chantierId||p.chantier_id));const s=Math.max(0,Math.ceil((new Date(p.debut)-min)/864e5));const d=Math.max(1,Math.ceil((new Date(p.fin)-new Date(p.debut))/864e5)+1);const c=phase[ch?.phase]||"#3B82F6";
          return(<div key={p.id} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #F8FAFC",minWidth:m?500:"auto"}}>
            <div style={{width:m?150:200,flexShrink:0,paddingRight:12}}><div style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{p.tache}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {p.lot}</div></div>
            <div style={{flex:1,position:"relative",height:24}}>
              <div style={{position:"absolute",left:`${s/total*100}%`,width:`${d/total*100}%`,top:3,height:18,background:c+"22",borderRadius:5,border:`1.5px solid ${c}`}}>
                <div style={{width:`${p.avancement}%`,height:"100%",background:c+"55",borderRadius:4}}/><span style={{position:"absolute",right:4,top:1,fontSize:9,fontWeight:700,color:c}}>{p.avancement}%</span>
              </div>
            </div>
          </div>);
        })
      }
    </div>
  </div>);
}
