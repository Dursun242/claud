'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { SB, Icon, I, fmtDate, fmtMoney, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { generateOSPdf, generateOSExcel } from '../generators'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export default function OrdresServiceV({data,m,reload}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [prestations,setPrestations]=useState([]);
  const [searchOS,setSearchOS]=useState("");
  const [saving,setSaving]=useState(false);
  const [signModal,setSignModal]=useState(null); // {os} quand ouvert
  const [odooTemplates,setOdooTemplates]=useState([]);
  const [selectedTemplate,setSelectedTemplate]=useState("");
  const [signSending,setSignSending]=useState(false);
  const [signError,setSignError]=useState("");
  // Templates de prestations
  const [osTemplates,setOsTemplates]=useState([]);
  const [showTemplates,setShowTemplates]=useState(false);
  const [savingTpl,setSavingTpl]=useState(false);
  // Import devis
  const [importLoading,setImportLoading]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const importInputRef=useRef(null);

  const nextNum = () => {
    const nums = (data.ordresService||[]).map(os => {
      const m = String(os.numero||"").match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `OS-${new Date().getFullYear()}-${String(next).padStart(3,"0")}`;
  };

  const openNew = () => {
    const ch = data.chantiers[0];
    const clientContact = data.contacts.find(c => c.nom === ch?.client);
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: clientContact?.adresse||"", client_tel: clientContact?.tel||"", client_email: clientContact?.email||"",
      artisan_nom: "", artisan_specialite: "", artisan_adresse: "", artisan_tel: "", artisan_email: "", artisan_siret: "",
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
    const clientContact = data.contacts.find(c => c.nom === ch?.client);
    setForm(f=>({...f, chantier_id: chId, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", client_nom: ch?.client||"", client_adresse: clientContact?.adresse||"", client_tel: clientContact?.tel||"", client_email: clientContact?.email||""}));
  };

  const updateDestinataire = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({...f, artisan_nom:co.nom, artisan_specialite:co.specialite||co.type||"", artisan_adresse:co.adresse||"", artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""}));
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
    if (saving) return;
    // Validation basique des prestations
    for (const p of prestations) {
      const q = parseFloat(p.quantite);
      const pu = parseFloat(p.prix_unitaire);
      if (p.description && (isNaN(q) || q < 0 || isNaN(pu) || pu < 0)) {
        alert("Vérifiez les quantités et prix unitaires — aucune valeur négative ou invalide.");
        return;
      }
    }
    setSaving(true);
    try {
      const t = calcTotals();
      const osData = { ...form, prestations, montant_ht:t.ht, montant_tva:t.tva, montant_ttc:t.ttc };
      await SB.upsertOS(osData);
      setModal(null);
      reload();
    } finally {
      setSaving(false);
    }
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

  // Dupliquer → ouvre le formulaire pour pouvoir éditer avant d'enregistrer
  const handleDuplicate = (os) => {
    const { id, created_at, updated_at, odoo_sign_id, odoo_sign_url, statut_signature, ...rest } = os;
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    setForm({ ...rest, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", numero: nextNum(), statut: "Brouillon", date_emission: new Date().toISOString().split("T")[0] });
    setPrestations((os.prestations||[]).map(p=>({...p,quantite:String(p.quantite||""),prix_unitaire:String(p.prix_unitaire||""),tva_taux:String(p.tva_taux||"20")})));
    setModal("new");
  };

  // ── Templates de prestations ───────────────────────────────────────────────
  useEffect(() => { SB.getTemplates('os').then(setOsTemplates).catch(()=>{}); }, []);

  const handleSaveTemplate = async () => {
    const name = window.prompt("Nom du modèle :");
    if (!name?.trim()) return;
    setSavingTpl(true);
    try {
      await SB.saveTemplate('os', name.trim(), `${prestations.length} ligne(s)`, { prestations });
      const updated = await SB.getTemplates('os');
      setOsTemplates(updated);
    } finally { setSavingTpl(false); }
  };

  const handleLoadTemplate = (tpl) => {
    setPrestations((tpl.data?.prestations||[]).map(p=>({...p,quantite:String(p.quantite||""),prix_unitaire:String(p.prix_unitaire||""),tva_taux:String(p.tva_taux||"20")})));
    setShowTemplates(false);
  };

  // ── Import devis PDF / image → pré-remplissage IA ─────────────────────────
  const handleImportDevis = async (file) => {
    if (!file) return;
    setImportLoading(true);
    setImportMsg("");
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64 = e.target.result.split(',')[1];
          const isPdf = file.type === 'application/pdf';
          const res = await fetch('/api/extract-os-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isPdf ? { pdfBase64: base64, fileName: file.name } : { imageBase64: base64, fileName: file.name }),
          });
          const json = await res.json();
          if (!json.success) throw new Error(json.error||"Erreur extraction");
          const d = json.data;
          if (d.prestations?.length) {
            setPrestations(d.prestations.map(p=>({description:p.description||"",unite:p.unite||"u",quantite:String(p.quantite||""),prix_unitaire:String(p.prix_unitaire||""),tva_taux:String(p.tva_taux||"20")})));
          }
          if (d.artisan_nom) updateDestinataire(d.artisan_nom);
          if (d.observations) setForm(f=>({...f,observations:(f.observations?f.observations+"\n":"")+d.observations}));
          setImportMsg(`✓ ${d.prestations?.length||0} prestation(s) extraite(s)${d.artisan_nom?` — ${d.artisan_nom}`:""}`);
        } catch(err) { setImportMsg("Erreur : "+err.message); }
        finally { setImportLoading(false); }
      };
      reader.readAsDataURL(file);
    } catch(err) { setImportMsg("Erreur : "+err.message); setImportLoading(false); }
  };

  const openSignModal = (os) => {
    setSignError("");
    setOdooTemplates([]);
    const nomLower = (os.artisan_nom || "").toLowerCase().trim();
    const contactMatch = data.contacts.find(c => (c.nom || "").toLowerCase().trim() === nomLower);
    const emailEffectif = os.artisan_email || contactMatch?.email || "";
    setSignModal({ ...os, artisan_email: emailEffectif });
  };

  const handleSendSign = async () => {
    if (!signModal) return;
    const emailEffectif = signModal.artisan_email;
    if (!emailEffectif) { setSignError("L'email du destinataire est introuvable dans l'annuaire."); return; }
    setSignSending(true);
    setSignError("");
    try {
      const ch = data.chantiers.find(c => c.id === signModal.chantier_id);
      const pdfResult = generateOSPdf({ ...signModal, chantier: ch?.nom || "", adresse_chantier: ch?.adresse || "", returnBase64: true });
      if (!pdfResult?.base64) throw new Error("Impossible de générer le PDF de l'OS");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/odoo/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          pdfBase64: pdfResult.base64,
          signerName: signModal.artisan_nom,
          signerEmail: emailEffectif,
          reference: signModal.numero,
          osId: signModal.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de la création');
      setSignModal(null);
      reload();
      alert(`Demande de signature envoyée à ${emailEffectif} via Odoo Sign !`);
    } catch (err) {
      setSignError(err.message);
    } finally {
      setSignSending(false);
    }
  };

  const handleEmail = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    const subject = encodeURIComponent(`Ordre de Service ${os.numero} — ${ch?.nom || ""}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVeuillez trouver ci-joint l'Ordre de Service ${os.numero} pour le chantier "${ch?.nom || ""}".\n\n` +
      `Destinataire : ${os.artisan_nom || ""}\n` +
      `Date d'émission : ${os.date_emission || ""}\n` +
      `Montant TTC : ${Number(os.montant_ttc||0).toLocaleString("fr-FR")} €\n\n` +
      `Cordialement,\nID Maîtrise`
    );
    const to = encodeURIComponent(os.artisan_email || "");
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
  };

  const osStatusColor = { "Brouillon":"#94A3B8", "Émis":"#3B82F6", "Signé":"#8B5CF6", "En cours":"#F59E0B", "Terminé":"#10B981", "Annulé":"#EF4444" };
  const totals = calcTotals();

  // useMemo : recalcule la liste filtrée seulement quand searchOS ou la liste change
  const filteredOS = useMemo(() => {
    const s = searchOS.toLowerCase().trim();
    if (!s) return data.ordresService || [];
    return (data.ordresService || []).filter(os => {
      const ch = data.chantiers.find(c => c.id === os.chantier_id);
      return (
        String(os.numero).toLowerCase().includes(s) ||
        (ch?.nom || "").toLowerCase().includes(s) ||
        (os.artisan_nom || "").toLowerCase().includes(s) ||
        (os.client_nom || "").toLowerCase().includes(s)
      );
    });
  }, [searchOS, data.ordresService, data.chantiers]);

  // Tous les contacts disponibles comme destinataires (pas seulement les artisans)
  const contactsParType = data.contacts.reduce((acc, c) => {
    const type = c.type || "Autre";
    if (!acc[type]) acc[type] = [];
    acc[type].push(c);
    return acc;
  }, {});

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" placeholder="Rechercher par n°, chantier, client ou adresse..." value={searchOS} onChange={e=>setSearchOS(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #E2E8F0",fontSize:12,width:m?"100%":"220px"}}/>
        <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
      </div>
    </div>

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:12}}>
      {filteredOS.length===0 ?
        <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13}}>Aucun ordre de service. Cliquez "+ Nouvel OS" pour en créer un.</div>
      : [...filteredOS].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(os=>{
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
                <div style={{fontSize:12,color:"#64748B"}}>{os.artisan_nom}{os.artisan_specialite ? ` · ${os.artisan_specialite}` : ""} — Client : {os.client_nom}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)} • {(os.prestations||[]).length} prestation(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(os.montant_ttc||0)}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>HT: {fmtMoney(os.montant_ht||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <button onClick={()=>handlePdf(os)} style={{background:"#EF4444",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>PDF</button>
              <button onClick={()=>handleExcel(os)} style={{background:"#10B981",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>XLS</button>
              <button onClick={()=>handleEmail(os)} title="Envoyer par email" style={{background:"#6366F1",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>✉ Email</button>
              {os.odoo_sign_url
                ? <a href={os.odoo_sign_url} target="_blank" rel="noreferrer" title={`Signature : ${os.statut_signature||"Envoyé"}`} style={{background:"#7C3AED",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff",textDecoration:"none"}}>✍ {os.statut_signature||"Signé"}</a>
                : <button onClick={()=>openSignModal(os)} title="Envoyer pour signature Odoo" style={{background:"#7C3AED",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>✍ Signature</button>
              }
              <button onClick={()=>handleDuplicate(os)} title="Dupliquer cet OS" style={{background:"#F59E0B",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Dupliquer</button>
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
        <FF label="Destinataire"><select style={sel} value={form.artisan_nom||""} onChange={e=>updateDestinataire(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {Object.entries(contactsParType).map(([type, contacts]) => (
            <optgroup key={type} label={type}>
              {contacts.map(c=><option key={c.id} value={c.nom}>{c.nom}{c.specialite ? ` · ${c.specialite}` : ""}</option>)}
            </optgroup>
          ))}
        </select></FF>
      </div>
      <FF label="Adresse du destinataire">
        <input style={inp} value={form.artisan_adresse||""} onChange={e=>setForm({...form,artisan_adresse:e.target.value})} placeholder="Adresse complète du prestataire"/>
      </FF>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Date émission"><input type="date" style={inp} value={form.date_emission||""} onChange={e=>setForm({...form,date_emission:e.target.value})}/></FF>
        <FF label="Date intervention"><input type="date" style={inp} value={form.date_intervention||""} onChange={e=>setForm({...form,date_intervention:e.target.value})}/></FF>
        <FF label="Date fin prévue"><input type="date" style={inp} value={form.date_fin_prevue||""} onChange={e=>setForm({...form,date_fin_prevue:e.target.value})}/></FF>
      </div>

      {/* PRESTATIONS */}
      <div style={{marginTop:12,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
          <span style={{fontSize:12,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase"}}>Prestations</span>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {/* Import devis */}
            <input ref={importInputRef} type="file" accept="application/pdf,image/*" style={{display:"none"}} onChange={e=>handleImportDevis(e.target.files[0])}/>
            <button onClick={()=>{setImportMsg("");importInputRef.current?.click();}} disabled={importLoading} title="Importer un devis PDF ou image pour pré-remplir les prestations" style={{fontSize:11,color:"#fff",background:"#6366F1",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600,opacity:importLoading?0.6:1}}>
              {importLoading?"⏳ Analyse...":"📄 Importer devis"}
            </button>
            {/* Charger modèle */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowTemplates(v=>!v)} disabled={!osTemplates.length} title={osTemplates.length?"Charger un modèle de prestations":"Aucun modèle enregistré"} style={{fontSize:11,color:"#fff",background:osTemplates.length?"#0EA5E9":"#94A3B8",border:"none",borderRadius:6,padding:"4px 10px",cursor:osTemplates.length?"pointer":"default",fontWeight:600}}>
                📂 Modèle{osTemplates.length?` (${osTemplates.length})`:""}
              </button>
              {showTemplates && (
                <div style={{position:"absolute",right:0,top:"110%",background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",zIndex:50,minWidth:200,padding:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#64748B",marginBottom:6,padding:"0 4px"}}>Choisir un modèle</div>
                  {osTemplates.map(tpl=>(
                    <button key={tpl.id} onClick={()=>handleLoadTemplate(tpl)} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",padding:"7px 8px",borderRadius:6,cursor:"pointer",fontSize:12,color:"#0F172A"}}>
                      <span style={{fontWeight:600}}>{tpl.name}</span>
                      {tpl.description&&<span style={{fontSize:10,color:"#94A3B8",marginLeft:6}}>{tpl.description}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Sauvegarder comme modèle */}
            <button onClick={handleSaveTemplate} disabled={savingTpl||!prestations.some(p=>p.description)} title="Sauvegarder les prestations comme modèle réutilisable" style={{fontSize:11,color:"#fff",background:"#10B981",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600,opacity:savingTpl?0.6:1}}>
              {savingTpl?"...":"💾 Enregistrer modèle"}
            </button>
            <button onClick={addPrestation} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>+ Ligne</button>
          </div>
        </div>
        {importMsg && <div style={{fontSize:11,padding:"5px 8px",borderRadius:6,marginBottom:8,background:importMsg.startsWith("✓")?"#F0FDF4":"#FEF2F2",color:importMsg.startsWith("✓")?"#166534":"#EF4444"}}>{importMsg}</div>}
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
        <button onClick={handleSave} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?"Enregistrement...":"Enregistrer l'OS"}</button>
      </div>
    </Modal>

    {/* MODAL SIGNATURE ODOO */}
    <Modal open={!!signModal} onClose={()=>setSignModal(null)} title="Envoyer pour signature Odoo">
      {signModal && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#F5F3FF",borderRadius:8,padding:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1E3A5F",marginBottom:4}}>OS {signModal.numero}</div>
            <div style={{fontSize:12,color:"#64748B"}}>Destinataire : <strong>{signModal.artisan_nom || "—"}</strong></div>
            <div style={{fontSize:12,color:"#64748B"}}>Email : <strong style={{color: signModal.artisan_email ? "#059669" : "#EF4444"}}>{signModal.artisan_email || "Non trouvé dans l'annuaire !"}</strong></div>
          </div>

          <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:10,fontSize:12,color:"#166534"}}>
            Le PDF exact de l'OS sera généré et envoyé à Odoo Sign. {signModal.artisan_nom} recevra un email pour signer.
          </div>

          {signError && <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:10,fontSize:12,color:"#EF4444"}}>{signError}</div>}

          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setSignModal(null)} style={btnS}>Annuler</button>
            <button onClick={handleSendSign} disabled={signSending || !signModal.artisan_email}
              style={{...btnP,background:"#7C3AED",opacity:(signSending||!signModal.artisan_email)?0.5:1}}>
              {signSending?"Génération et envoi…":"✍ Envoyer pour signature"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  </div>);
}
