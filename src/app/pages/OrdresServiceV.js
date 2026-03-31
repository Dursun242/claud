'use client'
import { useState } from 'react'
import { SB, Icon, I, fmtDate, fmtMoney, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { generateOSPdf, generateOSExcel } from '../generators'

export default function OrdresServiceV({data,m,reload}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [prestations,setPrestations]=useState([]);
  const [searchOS,setSearchOS]=useState("");

  const nextNum = () => {
    const existing = (data.ordresService||[]).length;
    return `OS-2026-${String(existing+1).padStart(3,"0")}`;
  };

  const openNew = () => {
    const ch = data.chantiers[0];
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: "",
      artisan_nom: "", artisan_specialite: "", artisan_tel: "", artisan_email: "", artisan_siret: "",
      date_emission: new Date().toISOString().split("T")[0], date_intervention: "", date_fin_prevue: "",
      observations: "", conditions: "Paiement à 30 jours à compter de la réception de la facture.",
      statut: "Brouillon",
    });
    setPrestations([{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
    setModal("new");
  };

  const openEdit = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    setForm({
      ...os,
      chantier: ch?.nom||"",
      adresse_chantier: ch?.adresse||"",
    });
    setPrestations((os.prestations||[]).length > 0
      ? os.prestations.map(p=>({...p, quantite:String(p.quantite||""), prix_unitaire:String(p.prix_unitaire||""), tva_taux:String(p.tva_taux||"20")}))
      : [{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]
    );
    setModal("edit");
  };

  const updateChantier = (chId) => {
    const ch = data.chantiers.find(c=>c.id===chId);
    setForm(f=>({...f, chantier_id: chId, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", client_nom: ch?.client||""}));
  };

  const updateArtisan = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({...f, artisan_nom:co.nom, artisan_specialite:co.specialite||"", artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""}));
    else setForm(f=>({...f, artisan_nom:name}));
  };

  const addPrestation = () => setPrestations(p=>[...p,{ description:"", unite:"u", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
  const removePrestation = (i) => setPrestations(p=>p.filter((_,j)=>j!==i));
  const updatePrestation = (i,field,val) => setPrestations(p=>p.map((x,j)=>j===i?{...x,[field]:val}:x));

  const calcTotals = () => {
    let ht=0, tva=0;
    prestations.forEach(p=>{
      const l = (parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0);
      ht += l; tva += l*(parseFloat(p.tva_taux)||20)/100;
    });
    return { ht, tva, ttc: ht+tva };
  };

  const handleSave = async () => {
    const t = calcTotals();
    const osData = { ...form, prestations, montant_ht:t.ht, montant_tva:t.tva, montant_ttc:t.ttc };
    await SB.upsertOS(osData);
    setModal(null);
    reload();
  };

  const handlePdf = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    generateOSPdf({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleExcel = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    generateOSExcel({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleDelete = async (id) => { if(!window.confirm("Supprimer cet ordre de service ?")) return; await SB.deleteOS(id); reload(); };

  const osStatusColor = { "Brouillon":"#94A3B8", "Émis":"#3B82F6", "Signé":"#8B5CF6", "En cours":"#F59E0B", "Terminé":"#10B981", "Annulé":"#EF4444" };
  const totals = calcTotals();

  const filterOS=(os)=>{const s=searchOS.toLowerCase();const ch=data.chantiers.find(c=>c.id===os.chantier_id);return String(os.numero).toLowerCase().includes(s)||(ch?.nom||"").toLowerCase().includes(s)||(os.client_nom||"").toLowerCase().includes(s)||(ch?.commune||"").toLowerCase().includes(s);};

  const artisans = data.contacts.filter(c=>c.type==="Artisan");

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" placeholder="Rechercher par n°, chantier, client ou commune..." value={searchOS} onChange={e=>setSearchOS(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #E2E8F0",fontSize:12,width:m?"100%":"220px"}}/>
        <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
      </div>
    </div>

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:12}}>
      {(data.ordresService||[]).filter(filterOS).length===0 ?
        <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13}}>Aucun ordre de service. Cliquez "+ Nouvel OS" pour en créer un.</div>
      : (data.ordresService||[]).filter(filterOS).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(os=>{
        const ch = data.chantiers.find(c=>c.id===os.chantier_id);
        return (
          <div key={os.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${osStatusColor[os.statut]||"#94A3B8"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{os.numero}</span>
                  <Badge text={os.statut} color={osStatusColor[os.statut]||"#94A3B8"}/>
                  <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ch?.nom||"—"}</span>
                </div>
                <div style={{fontSize:12,color:"#64748B"}}>{os.artisan_nom} ({os.artisan_specialite}) — Client : {os.client_nom}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)} • {(os.prestations||[]).length} prestation(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(os.montant_ttc||0)}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>HT: {fmtMoney(os.montant_ht||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <button onClick={()=>handlePdf(os)} style={{background:"#EF4444",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Télécharger PDF</button>
              <button onClick={()=>handleExcel(os)} style={{background:"#10B981",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Exporter Excel</button>
              <button onClick={()=>openEdit(os)} style={{background:"#3B82F6",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Modifier</button>
              <button onClick={()=>handleDelete(os.id)} style={{background:"none",border:"1px solid #FECACA",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </div>

    {/* MODAL CRÉATION OS */}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="edit"?"Modifier l'Ordre de Service":"Nouvel Ordre de Service"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="N° OS"><input style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
        <FF label="Chantier"><select style={sel} value={form.chantier_id||""} onChange={e=>updateChantier(e.target.value)}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option><option>Annulé</option></select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Client">{form.client_nom && <div style={{fontSize:13,padding:"8px 0",color:"#0F172A",fontWeight:600}}>{form.client_nom}</div>}</FF>
        <FF label="Artisan"><select style={sel} value={form.artisan_nom||""} onChange={e=>updateArtisan(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {artisans.map(a=><option key={a.id} value={a.nom}>{a.nom} ({a.specialite})</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Date émission"><input type="date" style={inp} value={form.date_emission||""} onChange={e=>setForm({...form,date_emission:e.target.value})}/></FF>
        <FF label="Date intervention"><input type="date" style={inp} value={form.date_intervention||""} onChange={e=>setForm({...form,date_intervention:e.target.value})}/></FF>
        <FF label="Date fin prévue"><input type="date" style={inp} value={form.date_fin_prevue||""} onChange={e=>setForm({...form,date_fin_prevue:e.target.value})}/></FF>
      </div>

      {/* PRESTATIONS */}
      <div style={{marginTop:12,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase"}}>Prestations</span>
          <button onClick={addPrestation} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>+ Ajouter une ligne</button>
        </div>
        {prestations.map((p,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:m?"1fr":"3fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"end"}}>
            <input placeholder="Description" style={{...inp,fontSize:12}} value={p.description} onChange={e=>updatePrestation(i,"description",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.unite} onChange={e=>updatePrestation(i,"unite",e.target.value)}>
              <option>u</option><option>m²</option><option>ml</option><option>m³</option><option>kg</option><option>h</option><option>forfait</option><option>ens</option>
            </select>
            <input placeholder="Qté" type="number" style={{...inp,fontSize:12}} value={p.quantite} onChange={e=>updatePrestation(i,"quantite",e.target.value)}/>
            <input placeholder="PU HT €" type="number" step="0.01" style={{...inp,fontSize:12}} value={p.prix_unitaire} onChange={e=>updatePrestation(i,"prix_unitaire",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.tva_taux} onChange={e=>updatePrestation(i,"tva_taux",e.target.value)}>
              <option value="20">20%</option><option value="10">10%</option><option value="5.5">5.5%</option><option value="0">0%</option>
            </select>
            <button onClick={()=>removePrestation(i)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
          </div>
        ))}
      </div>

      {/* TOTAUX */}
      <div style={{background:"#F8FAFC",borderRadius:8,padding:12,display:"flex",justifyContent:"flex-end",gap:20,marginBottom:12}}>
        <div><span style={{fontSize:11,color:"#64748B"}}>Total HT : </span><span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{fmtMoney(totals.ht)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TVA : </span><span style={{fontSize:14,fontWeight:700,color:"#F59E0B"}}>{fmtMoney(totals.tva)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TTC : </span><span style={{fontSize:16,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(totals.ttc)}</span></div>
      </div>

      <FF label="Observations"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.observations||""} onChange={e=>setForm({...form,observations:e.target.value})}/></FF>
      <FF label="Conditions de paiement"><textarea style={{...inp,minHeight:40,resize:"vertical"}} value={form.conditions||""} onChange={e=>setForm({...form,conditions:e.target.value})}/></FF>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer l'OS</button>
      </div>
    </Modal>
  </div>);
}
