'use client'
import { useState } from 'react'
import { SB, Icon, I, status, fmtDate, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'

export default function TasksV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [filter,setFilter]=useState("all");
  const tasks = filter==="all"?data.tasks:data.tasks.filter(t=>t.statut===filter);
  const openNew=()=>{setForm({chantierId:data.chantiers[0]?.id||"",titre:"",priorite:"En cours",statut:"Planifié",echeance:"",lot:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertTask(form);setModal(null);reload();};
  const toggle=async(t)=>{const cy=["Planifié","En cours","Terminé"];const idx=cy.indexOf(t.statut);const next=cy[(idx<0?0:idx+1)%3];await SB.upsertTask({...t,statut:next});reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer cette tâche ?")) return;await SB.deleteTask(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Tâches</h1>
      <div style={{display:"flex",gap:8}}>
        <select style={{...sel,width:"auto",fontSize:12}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Toutes</option><option value="En cours">En cours</option><option value="Planifié">Planifiées</option><option value="Terminé">Terminées</option></select>
        <button onClick={openNew} style={{...btnP,fontSize:12,padding:"8px 14px"}}>+ Tâche</button>
      </div>
    </div>
    <div style={{display:"grid",gap:6}}>
      {tasks.map(t=>{const ch=data.chantiers.find(c=>c.id===t.chantierId);return(
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:10,padding:m?"10px 12px":"12px 16px",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
          <button onClick={()=>toggle(t)} style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${status[t.statut]||"#CBD5E1"}`,background:t.statut==="Terminé"?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{t.statut==="Terminé"&&<Icon d={I.check} size={12} color="#fff"/>}</button>
          <div style={{flex:1,opacity:t.statut==="Terminé"?.5:1}}><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {t.lot}</div></div>
          <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>{!m&&<span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(t.echeance)}</span>}
          <button onClick={()=>{setForm(t);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.edit} size={13} color="#94A3B8"/></button>
          <button onClick={()=>handleDelete(t.id)} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.trash} size={13} color="#CBD5E1"/></button>
        </div>
      );})}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouvelle tâche":"Modifier"}>
      <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
      <FF label="Titre"><input style={inp} value={form.titre||""} onChange={e=>setForm({...form,titre:e.target.value})}/></FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <FF label="Lot"><input style={inp} value={form.lot||""} onChange={e=>setForm({...form,lot:e.target.value})}/></FF>
        <FF label="Échéance"><input type="date" style={inp} value={form.echeance||""} onChange={e=>setForm({...form,echeance:e.target.value})}/></FF>
        <FF label="Priorité"><select style={sel} value={form.priorite||""} onChange={e=>setForm({...form,priorite:e.target.value})}><option>En cours</option><option>Urgent</option><option>En attente</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>Terminé</option></select></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}
