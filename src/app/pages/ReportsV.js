'use client'
import { useState } from 'react'
import { SB, Icon, I, fmtDate, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Modal } from '../components'
import { generateCRPdf, generateCRExcel } from '../generators'

export default function ReportsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [searchCR,setSearchCR]=useState("");
  const chantiers = Array.isArray(data?.chantiers) ? data.chantiers : [];
  const compteRendus = Array.isArray(data?.compteRendus) ? data.compteRendus : [];
  const openNew=()=>{setForm({chantierId:chantiers[0]?.id||"",date:new Date().toISOString().split("T")[0],numero:compteRendus.length+1,resume:"",participants:"",decisions:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertCR(form);setModal(null);reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer ce compte rendu ?")) return;await SB.deleteCR(id);reload();};

  const filterCR=(cr)=>{const s=searchCR.toLowerCase();const ch=Array.isArray(chantiers) ? chantiers.find(c=>c.id===(cr.chantierId||cr.chantier_id)) : null;return String(cr.numero).toLowerCase().includes(s)||(ch?.nom||"").toLowerCase().includes(s)||(ch?.client||"").toLowerCase().includes(s)||(ch?.adresse||"").toLowerCase().includes(s);};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Comptes Rendus</h1>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" placeholder="Rechercher par n°, chantier, client ou adresse..." value={searchCR} onChange={e=>setSearchCR(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #E2E8F0",fontSize:12,width:m?"100%":"220px"}}/>
        <button onClick={openNew} style={{...btnP,fontSize:12}}>+ CR</button>
      </div>
    </div>
    {compteRendus.filter(filterCR).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>{const ch=Array.isArray(chantiers) ? chantiers.find(c=>c.id===(cr.chantierId||cr.chantier_id)) : null;return(
      <div key={cr.id} style={{background:"#fff",borderRadius:12,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:700}}>CR n°{cr.numero}</span><span style={{fontWeight:700,fontSize:14}}>{ch?.nom}</span><span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span></div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>generateCRPdf(cr,ch)} title="PDF" style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>PDF</button>
            <button onClick={()=>generateCRExcel(cr,ch)} title="Excel" style={{background:"#10B981",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>XLS</button>
            <button onClick={()=>{setForm(cr);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={14} color="#94A3B8"/></button>
            <button onClick={()=>handleDelete(cr.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={14} color="#CBD5E1"/></button>
          </div>
        </div>
        <div style={{fontSize:13,color:"#334155",lineHeight:1.6,marginBottom:8}}>{cr.resume}</div>
        <div style={{fontSize:11}}><span style={{fontWeight:600,color:"#64748B"}}>Présents:</span> <span style={{color:"#94A3B8"}}>{cr.participants}</span></div>
        {cr.decisions&&<div style={{marginTop:8,background:"#FEF3C7",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#92400E"}}><b>Décisions:</b> {cr.decisions}</div>}
      </div>
    );})}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau CR":"Modifier"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Date"><input type="date" style={inp} value={form.date||""} onChange={e=>setForm({...form,date:e.target.value})}/></FF>
        <FF label="N°"><input type="number" style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
      </div>
      <FF label="Résumé"><textarea style={{...inp,minHeight:80,resize:"vertical"}} value={form.resume||""} onChange={e=>setForm({...form,resume:e.target.value})}/></FF>
      <FF label="Participants"><input style={inp} value={form.participants||""} onChange={e=>setForm({...form,participants:e.target.value})}/></FF>
      <FF label="Décisions"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.decisions||""} onChange={e=>setForm({...form,decisions:e.target.value})}/></FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}
