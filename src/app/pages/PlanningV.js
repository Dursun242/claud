'use client'
import { useState, useMemo } from 'react'
import { phase, sel, fmtDate } from '../dashboards/shared'

export default function PlanningV({data,m}) {
  const [filter, setFilter] = useState("all")

  const items = useMemo(() => (
    filter === "all"
      ? (data.planning || [])
      : (data.planning || []).filter(p => p.chantierId === filter || p.chantier_id === filter)
  ), [filter, data.planning])

  if (!data.planning || data.planning.length === 0) {
    return (<div>
      <h1 style={{margin:"0 0 16px",fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <div style={{background:"#fff",borderRadius:12,padding:"40px 24px",textAlign:"center",boxShadow:"0 1px 3px rgba(15,23,42,0.06)"}}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>📅</div>
        <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Planning vide</div>
        <div style={{fontSize:12,color:"#94A3B8"}}>
          Ajoute des tâches planifiées depuis la fiche d'un chantier pour les voir apparaître ici.
        </div>
      </div>
    </div>)
  }

  const timestamps = data.planning.map(p => new Date(p.debut).getTime()).filter(t => !isNaN(t))
  const endTimestamps = data.planning.map(p => new Date(p.fin).getTime()).filter(t => !isNaN(t))
  if (timestamps.length === 0 || endTimestamps.length === 0) return null

  const min = new Date(Math.min(...timestamps))
  const max = new Date(Math.max(...endTimestamps))
  const total = Math.max(Math.ceil((max - min) / 864e5) + 1, 1)

  // Position du jour J sur l'échelle (en %) — pour afficher un marqueur "Aujourd'hui"
  const now = new Date()
  const todayOffset = Math.ceil((now - min) / 864e5)
  const todayPercent = (todayOffset / total) * 100
  const showTodayLine = todayPercent >= 0 && todayPercent <= 100

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Planning</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {data.planning.length} tâche{data.planning.length>1?"s":""} planifiée{data.planning.length>1?"s":""}
          {filter !== "all" && <> · <strong>{items.length}</strong> affichée{items.length>1?"s":""}</>}
        </div>
      </div>
      <select style={{...sel,width:"auto"}} value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">🏗️ Tous les chantiers</option>
        {data.chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
      </select>
    </div>

    <div style={{background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(15,23,42,0.06)",overflowX:"auto"}}>
      {/* Échelle de dates en haut du chart */}
      <div style={{display:"flex",alignItems:"center",marginBottom:10,paddingBottom:10,borderBottom:"1px dashed #E2E8F0",minWidth:m?500:"auto"}}>
        <div style={{width:m?150:200,flexShrink:0,paddingRight:12,fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.05em"}}>Tâche</div>
        <div style={{flex:1,display:"flex",justifyContent:"space-between",fontSize:10,color:"#94A3B8",fontWeight:600}}>
          <span>{fmtDate(min)}</span>
          {showTodayLine && <span style={{color:"#EF4444"}}>⚊ Aujourd'hui</span>}
          <span>{fmtDate(max)}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{textAlign:"center",color:"#94A3B8",padding:"24px 0",fontSize:13}}>Aucune tâche pour ce chantier.</div>
      ) : items.map(p => {
        const ch = data.chantiers.find(c => c.id === (p.chantierId || p.chantier_id))
        const s = Math.max(0, Math.ceil((new Date(p.debut) - min) / 864e5))
        const d = Math.max(1, Math.ceil((new Date(p.fin) - new Date(p.debut)) / 864e5) + 1)
        const c = phase[ch?.phase] || "#3B82F6"
        return (
          <div key={p.id} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #F8FAFC",minWidth:m?500:"auto"}}>
            <div style={{width:m?150:200,flexShrink:0,paddingRight:12}}>
              <div style={{fontSize:12,fontWeight:600,color:"#0F172A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.tache}</div>
              <div style={{fontSize:10,color:"#94A3B8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ch?.nom} • {p.lot}</div>
            </div>
            <div style={{flex:1,position:"relative",height:24}}>
              {/* Marqueur "Aujourd'hui" — une ligne verticale rouge */}
              {showTodayLine && (
                <div style={{position:"absolute",left:`${todayPercent}%`,top:-2,bottom:-2,width:0,borderLeft:"1.5px dashed #EF4444",zIndex:1,pointerEvents:"none"}}/>
              )}
              {/* Barre de la tâche */}
              <div title={`${fmtDate(p.debut)} → ${fmtDate(p.fin)} · ${p.avancement}%`} style={{position:"absolute",left:`${s/total*100}%`,width:`${d/total*100}%`,top:3,height:18,background:c+"22",borderRadius:5,border:`1.5px solid ${c}`,overflow:"hidden"}}>
                <div style={{width:`${p.avancement}%`,height:"100%",background:c+"55",borderRadius:4}}/>
                <span style={{position:"absolute",right:4,top:1,fontSize:9,fontWeight:700,color:c}}>{p.avancement}%</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  </div>)
}
