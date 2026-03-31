'use client'
import { useState } from 'react'
import { SB, Icon, I, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'

export default function ContactsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [tf,setTf]=useState("all");const [q,setQ]=useState("");
  const [pSearch,setPSearch]=useState("");const [pLoading,setPLoading]=useState(false);const [pResults,setPResults]=useState(null);const [pError,setPError]=useState("");
  const tc={Artisan:"#F59E0B",Client:"#3B82F6",Fournisseur:"#10B981","Sous-traitant":"#8B5CF6",Prestataire:"#EC4899",MOA:"#0EA5E9",Architecte:"#6366F1",BET:"#14B8A6"};
  const types = ["Artisan","Sous-traitant","Prestataire","Client","Fournisseur","MOA","Architecte","BET"];
  const list=data.contacts.filter(c=>{
    if(tf!=="all"&&c.type!==tf) return false;
    if(!q) return true;
    const search=q.toLowerCase();
    return (c.nom||"").toLowerCase().includes(search)||(c.specialite||"").toLowerCase().includes(search)||(c.societe||"").toLowerCase().includes(search)||(c.ville||"").toLowerCase().includes(search)||(c.email||"").toLowerCase().includes(search)||(c.siret||"").includes(search);
  });

  const emptyForm = {nom:"",type:"Artisan",specialite:"",societe:"",fonction:"",tel:"",tel_fixe:"",email:"",adresse:"",code_postal:"",ville:"",siret:"",tva_intra:"",assurance_decennale:"",assurance_validite:"",iban:"",qualifications:"",site_web:"",note:0,actif:true,notes:""};

  const openNew=()=>{setForm(emptyForm);setPSearch("");setPResults(null);setPError("");setModal("new");};
  const handleSave=async()=>{await SB.upsertContact(form);setModal(null);reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer ce contact ? Cette action est irréversible.")) return;await SB.deleteContact(id);reload();};

  // ── Pappers : mapping réponse → formulaire ──
  const fillFromPappers = (entreprise) => {
    const siege = entreprise.siege || {};
    setForm(f => ({
      ...f,
      nom: entreprise.denomination || f.nom,
      societe: entreprise.denomination || f.societe,
      siret: entreprise.siret || siege.siret || f.siret,
      tva_intra: entreprise.num_tva_intracommunautaire || f.tva_intra,
      adresse: siege.adresse_ligne_1 || siege.adresse || f.adresse,
      code_postal: siege.code_postal || f.code_postal,
      ville: siege.ville || f.ville,
      tel: entreprise.telephone || f.tel,
      email: entreprise.email || f.email,
      site_web: entreprise.site_internet || f.site_web,
      specialite: entreprise.libelle_activite_principale || f.specialite,
    }));
    setPResults(null);
    setPSearch("");
    setPError("");
  };

  const searchPappers = async () => {
    const v = pSearch.trim();
    if (!v) return;
    setPLoading(true); setPError(""); setPResults(null);
    try {
      const isSiret = /^\d{14}$/.test(v.replace(/\s/g,""));
      const cleanSiret = v.replace(/\s/g,"");
      const url = isSiret ? `/api/pappers?siret=${cleanSiret}` : `/api/pappers?q=${encodeURIComponent(v)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) { setPError(json.error || "Erreur Pappers"); return; }
      if (isSiret) {
        // Résultat direct → on remplit le form
        fillFromPappers(json);
      } else {
        // Liste de résultats → on affiche pour choisir
        const results = json.resultats || [];
        if (results.length === 0) { setPError("Aucune entreprise trouvée."); return; }
        setPResults(results);
      }
    } catch(e) { setPError("Erreur réseau : " + e.message); }
    finally { setPLoading(false); }
  };

  // Stats par type
  const stats = {};
  types.forEach(t => { const c = data.contacts.filter(x=>x.type===t).length; if(c>0) stats[t]=c; });

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Annuaire</h1>
        <p style={{margin:"2px 0 0",fontSize:12,color:"#94A3B8"}}>{data.contacts.length} contacts</p>
      </div>
      <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouveau contact</button>
    </div>

    {/* Search + Filters */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:200}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><Icon d={I.search} size={14} color="#94A3B8"/></span><input placeholder="Rechercher nom, société, ville, email..." style={{...inp,paddingLeft:30,fontSize:13}} value={q} onChange={e=>setQ(e.target.value)}/></div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setTf("all")} style={{padding:"5px 12px",borderRadius:16,border:"1.5px solid",borderColor:tf==="all"?"#1E3A5F":"#E2E8F0",background:tf==="all"?"#1E3A5F":"#fff",color:tf==="all"?"#fff":"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Tous ({data.contacts.length})</button>
      {Object.entries(stats).map(([type,count])=>(
        <button key={type} onClick={()=>setTf(type)} style={{padding:"5px 12px",borderRadius:16,border:"1.5px solid",borderColor:tf===type?tc[type]||"#1E3A5F":"#E2E8F0",background:tf===type?tc[type]||"#1E3A5F":"#fff",color:tf===type?"#fff":"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{type}s ({count})</button>
      ))}
    </div>

    {/* Contact Cards */}
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
      {list.map(c=>(
        <div key={c.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",borderLeft:`4px solid ${tc[c.type]||"#94A3B8"}`,opacity:c.actif===false?0.5:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>{c.nom}</span>
                <Badge text={c.type} color={tc[c.type]||"#94A3B8"}/>
                {c.actif===false && <Badge text="Inactif" color="#94A3B8"/>}
                {c.note>0 && <span style={{fontSize:11,color:"#F59E0B"}}>{"★".repeat(c.note)}{"☆".repeat(5-c.note)}</span>}
              </div>
              {c.societe && <div style={{fontSize:12,fontWeight:600,color:"#334155",marginBottom:2}}>{c.societe}</div>}
              {c.specialite && <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>{c.specialite}{c.fonction?` — ${c.fonction}`:""}</div>}
              <div style={{fontSize:11,color:"#94A3B8"}}>
                {c.tel && <span>{c.tel}</span>}
                {c.tel_fixe && <span> • {c.tel_fixe}</span>}
                {c.email && <span> • {c.email}</span>}
              </div>
              {(c.ville||c.adresse) && <div style={{fontSize:10,color:"#CBD5E1",marginTop:2}}>{[c.adresse,c.code_postal,c.ville].filter(Boolean).join(", ")}</div>}
              {c.siret && <div style={{fontSize:10,color:"#CBD5E1"}}>SIRET: {c.siret}</div>}
              {c.qualifications && <div style={{fontSize:10,color:"#3B82F6",marginTop:2}}>{c.qualifications}</div>}
            </div>
            <div style={{display:"flex",gap:3,flexShrink:0}}>
              <button onClick={()=>{setForm({...c});setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={14} color="#94A3B8"/></button>
              <button onClick={()=>handleDelete(c.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={14} color="#CBD5E1"/></button>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* MODAL — Formulaire enrichi */}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau contact":"Modifier le contact"} wide>

      {/* ── RECHERCHE PAPPERS ── */}
      <div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span style={{fontSize:12,fontWeight:700,color:"#1E40AF"}}>Recherche Pappers</span>
          <span style={{fontSize:10,color:"#60A5FA"}}>SIRET (14 chiffres) ou nom de l'entreprise</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <input
            style={{...inp,flex:1,fontSize:13}}
            placeholder="Ex: 12345678901234 ou Lefèvre Électricité..."
            value={pSearch}
            onChange={e=>setPSearch(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&searchPappers()}
          />
          <button
            onClick={searchPappers}
            disabled={pLoading||!pSearch.trim()}
            style={{...btnP,background:"#3B82F6",padding:"8px 16px",fontSize:12,opacity:pLoading||!pSearch.trim()?0.6:1,whiteSpace:"nowrap"}}
          >{pLoading?"Recherche...":"Rechercher"}</button>
        </div>
        {pError && <div style={{marginTop:8,fontSize:11,color:"#EF4444"}}>{pError}</div>}
        {pResults && (
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:11,color:"#64748B",fontWeight:600}}>Sélectionnez une entreprise :</div>
            {pResults.map((r,i)=>{
              const siege = r.siege||{};
              return (
                <button key={i} onClick={()=>fillFromPappers(r)}
                  style={{background:"#fff",border:"1.5px solid #BFDBFE",borderRadius:8,padding:"8px 12px",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontFamily:"inherit"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{r.denomination}</div>
                    <div style={{fontSize:10,color:"#64748B"}}>{siege.code_postal} {siege.ville} — SIRET {r.siret}</div>
                    {r.libelle_activite_principale&&<div style={{fontSize:10,color:"#94A3B8"}}>{r.libelle_activite_principale}</div>}
                  </div>
                  <span style={{fontSize:11,color:"#3B82F6",fontWeight:600,flexShrink:0}}>Importer →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Identité */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:4}}>Identité</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Nom / Prénom *"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Société / Raison sociale"><input style={inp} value={form.societe||""} onChange={e=>setForm({...form,societe:e.target.value})}/></FF>
        <FF label="Type"><select style={sel} value={form.type||""} onChange={e=>setForm({...form,type:e.target.value})}>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Spécialité / Métier"><input style={inp} value={form.specialite||""} onChange={e=>setForm({...form,specialite:e.target.value})} placeholder="Ex: Électricité CFO/CFA, Gros œuvre..."/></FF>
        <FF label="Fonction"><input style={inp} value={form.fonction||""} onChange={e=>setForm({...form,fonction:e.target.value})} placeholder="Ex: Gérant, Conducteur de travaux..."/></FF>
      </div>

      {/* Coordonnées */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Coordonnées</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Tél. mobile"><input style={inp} value={form.tel||""} onChange={e=>setForm({...form,tel:e.target.value})} placeholder="06 ..."/></FF>
        <FF label="Tél. fixe"><input style={inp} value={form.tel_fixe||""} onChange={e=>setForm({...form,tel_fixe:e.target.value})} placeholder="02 35 ..."/></FF>
        <FF label="Email"><input type="email" style={inp} value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})}/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"2fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Adresse"><input style={inp} value={form.adresse||""} onChange={e=>setForm({...form,adresse:e.target.value})}/></FF>
        <FF label="Code postal"><input style={inp} value={form.code_postal||""} onChange={e=>setForm({...form,code_postal:e.target.value})}/></FF>
        <FF label="Ville"><input style={inp} value={form.ville||""} onChange={e=>setForm({...form,ville:e.target.value})}/></FF>
      </div>
      <FF label="Site web"><input style={inp} value={form.site_web||""} onChange={e=>setForm({...form,site_web:e.target.value})} placeholder="https://..."/></FF>

      {/* Administratif */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Administratif</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="SIRET"><input style={inp} value={form.siret||""} onChange={e=>setForm({...form,siret:e.target.value})} placeholder="XXX XXX XXX XXXXX"/></FF>
        <FF label="TVA intracommunautaire"><input style={inp} value={form.tva_intra||""} onChange={e=>setForm({...form,tva_intra:e.target.value})} placeholder="FR XX XXXXXXXXX"/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Assurance décennale"><input style={inp} value={form.assurance_decennale||""} onChange={e=>setForm({...form,assurance_decennale:e.target.value})} placeholder="N° police + assureur"/></FF>
        <FF label="Validité assurance"><input type="date" style={inp} value={form.assurance_validite||""} onChange={e=>setForm({...form,assurance_validite:e.target.value})}/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="IBAN"><input style={inp} value={form.iban||""} onChange={e=>setForm({...form,iban:e.target.value})} placeholder="FR76 XXXX ..."/></FF>
        <FF label="Qualifications (Qualibat, RGE...)"><input style={inp} value={form.qualifications||""} onChange={e=>setForm({...form,qualifications:e.target.value})}/></FF>
      </div>

      {/* Évaluation */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Évaluation</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Note (étoiles)">
          <div style={{display:"flex",gap:4}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>setForm({...form,note:form.note===n?0:n})} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:n<=(form.note||0)?"#F59E0B":"#E2E8F0"}}>★</button>
            ))}
          </div>
        </FF>
        <FF label="Statut">
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
            <input type="checkbox" checked={form.actif!==false} onChange={e=>setForm({...form,actif:e.target.checked})}/>
            {form.actif!==false?"Actif":"Inactif"}
          </label>
        </FF>
      </div>
      <FF label="Notes / Remarques"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notes internes..."/></FF>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer</button>
      </div>
    </Modal>
  </div>);
}
