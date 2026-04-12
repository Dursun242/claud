'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { SB, Icon, I, phase, status, fmtDate, fmtMoney, pct, FF, inp, sel, btnP, btnS, PBar } from '../dashboards/shared'
import { Badge, Modal, AttachmentsSection, CommentsSection, SharingPanel, TemplateSelector } from '../components'
import { useAttachments } from '../hooks/useAttachments'
import { useComments } from '../hooks/useComments'
import { useSharing } from '../hooks/useSharing'
import { generateOSPdf, generateCRPdf, generateOSExcel, generateCRExcel } from '../generators'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'

// Listes canoniques utilisées pour les pills de filtre
const PROJECT_STATUSES = ["Planifié","En cours","En attente","Terminé"]
const PROJECT_PHASES = ["Avant-projet","Études","Gros œuvre","Hors d'air","Technique","Finitions"]

// Style doux pour les boutons d'action dans la vue détail (PDF/XLS/etc.)
// Remplace les blocs rouge/vert/bleu saturés par des pastilles pastel.
const detailBtn = (color, bg, border) => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 5,
  padding: "4px 9px",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 700,
  color,
  fontFamily: "inherit",
})

export default function ProjectsV({data,save,m,reload,user,profile,focusId,focusTs,readOnly}) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const [selected,setSelected]=useState(null);
  const [detailModal,setDetailModal]=useState(null);
  const [detailForm,setDetailForm]=useState({});
  const [q,setQ]=useState("");
  const [filterStatut,setFilterStatut]=useState("");
  const [filterPhase,setFilterPhase]=useState("");
  const searchInputRef = useRef(null);

  // Phase 3 Hooks - Replaces 9 useState calls + useEffect
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments('chantier', selected);
  const { comments, addComment, deleteComment } = useComments('chantier', selected, user?.email);
  const { shares, addShare, deleteShare } = useSharing(selected);

  // Dérivées memoizées : évite de recalculer à chaque frappe dans un input.
  // Recalculées uniquement si data ou selected change.
  const selectedChantier = useMemo(
    () => (selected ? data.chantiers.find(c => c.id === selected) : null),
    [data.chantiers, selected]
  );

  const selectedRelated = useMemo(() => {
    if (!selectedChantier) return null;
    const ch = selectedChantier;
    const chTasks = (data.tasks || []).filter(t => (t.chantierId || t.chantier_id) === ch.id);
    const chOS = (data.ordresService || []).filter(o => o.chantier_id === ch.id);
    const chCR = (data.compteRendus || []).filter(c => (c.chantierId || c.chantier_id) === ch.id);
    const chPlanning = (data.planning || []).filter(p => (p.chantierId || p.chantier_id) === ch.id);
    const artisanNames = [...new Set(chOS.map(o => o.artisan_nom).filter(Boolean))];
    const contactMap = new Map((data.contacts || []).map(c => [c.nom, c]));
    const intervenants = artisanNames.map(name => contactMap.get(name)).filter(Boolean);
    const clientContact = contactMap.get(ch.client);
    return { chTasks, chOS, chCR, chPlanning, intervenants, clientContact };
  }, [selectedChantier, data.tasks, data.ordresService, data.compteRendus, data.planning, data.contacts]);

  const chantiersFiltered = useMemo(() => {
    const search = q.toLowerCase().trim();
    return data.chantiers.filter(ch => {
      if (filterStatut && ch.statut !== filterStatut) return false;
      if (filterPhase && ch.phase !== filterPhase) return false;
      if (!search) return true;
      return (
        (ch.nom || "").toLowerCase().includes(search) ||
        (ch.client || "").toLowerCase().includes(search) ||
        (ch.adresse || "").toLowerCase().includes(search)
      );
    });
  }, [data.chantiers, filterStatut, filterPhase, q]);

  // Focus depuis la recherche globale : ouvre directement la vue détail
  // du chantier correspondant.
  useEffect(() => {
    if (!focusId) return;
    const exists = (data.chantiers || []).some(c => c.id === focusId);
    if (exists) setSelected(focusId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs]);

  const openNew=()=>{setForm({nom:"",client:"",adresse:"",phase:"Hors d'air",statut:"Planifié",budget:"",depenses:0,dateDebut:"",dateFin:"",lots:"",photo_couverture:"",notes_internes:""});setModal("new");};
  const [saving,setSaving]=useState(false);

  // Raccourci clavier « n » pour créer un chantier (hors saisie, hors modale,
  // hors vue détail qui a ses propres actions)
  const openNewRef = useRef(null);
  useEffect(() => { openNewRef.current = openNew; });
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (modal || detailModal || selected) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, detailModal, selected]);
  const handleSave=async()=>{
    if(saving) return;
    setSaving(true);
    try {
      const e={...form,budget:Number(form.budget)||0,depenses:Number(form.depenses)||0,lots:typeof form.lots==="string"?(form.lots||"").split(",").map(l=>l.trim()).filter(Boolean):form.lots||[]};
      await SB.upsertChantier(e);
      setModal(null);
      reload();
      addToast("Chantier enregistré","success");
    } catch(err) {
      addToast("Erreur : "+err.message,"error");
    } finally { setSaving(false); }
  };
  const handleDelete = async (ch) => {
    const ok = await confirm({
      title: `Supprimer le chantier « ${ch.nom} » ?`,
      message: "Le chantier sera supprimé, mais les OS, CR et tâches associés ne seront pas effacés. Cette action est irréversible.",
      confirmLabel: "Supprimer le chantier",
      danger: true,
    });
    if (!ok) return;
    try { await SB.deleteChantier(ch.id); setSelected(null); reload(); addToast("Chantier supprimé", "success"); }
    catch (err) { addToast("Erreur : " + (err?.message || "suppression impossible"), "error"); }
  };

  // Phase 3 Hooks handle loading data automatically - no useEffect needed!

  // If a chantier is selected, show detail view
  if (selected) {
    const ch = selectedChantier;
    if (!ch) { setSelected(null); return null; }

    // Données dérivées memoizées (voir useMemo plus haut)
    const { chTasks, chOS, chCR, chPlanning, intervenants, clientContact } = selectedRelated;

    const ratio = pct(ch.depenses, ch.budget);
    const budgetColor = ratio>85?"#EF4444":ratio>60?"#F59E0B":"#10B981";

    const Section = ({title, count, color, children}) => (
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:700,color:"#0F172A"}}>{title}</h3>
          {count!==undefined && <span style={{background:(color||"#3B82F6")+"18",color:color||"#3B82F6",fontSize:11,fontWeight:700,borderRadius:10,padding:"2px 8px"}}>{count}</span>}
        </div>
        {children}
      </div>
    );

    return (<div>
      {/* Back button + Header */}
      <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,color:"#3B82F6",fontSize:13,fontWeight:600,marginBottom:16,fontFamily:"inherit",padding:0}}>
        ← Retour aux chantiers
      </button>

      {/* Photo de couverture */}
      {ch.photo_couverture && (
        <div style={{borderRadius:14,overflow:"hidden",marginBottom:16,height:180,position:"relative"}}>
          <img src={ch.photo_couverture} alt={ch.nom} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top, rgba(15,23,42,0.5) 0%, transparent 60%)"}}/>
          <h1 style={{position:"absolute",bottom:16,left:20,margin:0,fontSize:m?20:26,fontWeight:700,color:"#fff",textShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>{ch.nom}</h1>
        </div>
      )}

      {/* Chantier Header Card */}
      <div style={{background:"#fff",borderRadius:14,padding:m?16:24,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`5px solid ${phase[ch.phase]||"#3B82F6"}`,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              <h1 style={{margin:0,fontSize:m?20:26,fontWeight:700,color:"#0F172A"}}>{ch.nom}</h1>
              <Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/>
              <Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/>
            </div>
            <div style={{fontSize:14,color:"#64748B",marginBottom:2}}>{ch.client}</div>
            <div style={{fontSize:13,color:"#94A3B8"}}>{ch.adresse}</div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>Du {fmtDate(ch.date_debut||ch.dateDebut)} au {fmtDate(ch.date_fin||ch.dateFin)}</div>
            {ch.lots?.length>0 && <div style={{fontSize:11,color:"#CBD5E1",marginTop:4}}>Lots : {ch.lots.join(", ")}</div>}
          </div>
          {!readOnly && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={async()=>{await SB.duplicateChantier(ch);reload();}} style={{...btnS,fontSize:12,padding:"8px 14px"}}>Dupliquer</button>
            <button onClick={()=>{setForm({...ch,lots:ch.lots?.join(", ")||"",budget:String(ch.budget),depenses:String(ch.depenses),dateDebut:ch.date_debut||ch.dateDebut||"",dateFin:ch.date_fin||ch.dateFin||""});setModal("edit");}} style={{...btnS,fontSize:12,padding:"8px 14px"}}>Modifier</button>
            <button onClick={()=>setDetailModal("share")} style={{...btnS,fontSize:12,padding:"8px 14px"}}>👥 Partager</button>
          </div>}
        </div>
        {/* Budget bar */}
        <div style={{marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:12,marginBottom:12}}>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Budget</div><div style={{fontSize:18,fontWeight:700,color:"#0F172A"}}>{fmtMoney(ch.budget)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Dépensé</div><div style={{fontSize:18,fontWeight:700,color:budgetColor}}>{fmtMoney(ch.depenses)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Reste</div><div style={{fontSize:18,fontWeight:700,color:"#0F172A"}}>{fmtMoney(ch.budget-ch.depenses)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Avancement</div><div style={{fontSize:18,fontWeight:700,color:budgetColor}}>{ratio}%</div></div>
          </div>
          <PBar value={ch.depenses} max={ch.budget} color={budgetColor} h={10}/>
        </div>
      </div>

      {/* ATTACHMENTS - Using Phase 3 Hook */}
      <AttachmentsSection
        attachments={attachments}
        onUpload={uploadAttachment}
        onDelete={deleteAttachment}
      />

      {/* ORDRES DE SERVICE */}
      <Section title="Ordres de Service" count={chOS.length} color="#8B5CF6">
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>{const nextNum=`OS-2026-${String(chOS.length+1).padStart(3,"0")}`;setDetailForm({numero:nextNum,chantier_id:ch.id,date_emission:new Date().toISOString().split("T")[0],statut:"Brouillon",montant_ttc:0});setDetailModal("newOS");}} style={{background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvel OS</button>
          <button onClick={()=>setDetailModal("useTemplate")} style={{background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",opacity:0.7}}>📋 Template</button>
        </div>}
        {chOS.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun OS pour ce chantier</p> :
          chOS.map(os=>(
            // Sur mobile : colonne (titre au-dessus, boutons en dessous)
            // Sur desktop : ligne (titre à gauche, boutons à droite)
            <div key={os.id} style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",display:"flex",flexDirection:m?"column":"row",justifyContent:"space-between",alignItems:m?"stretch":"flex-start",gap:m?8:8,minWidth:0,overflow:"hidden"}}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#0F172A",whiteSpace:"nowrap"}}>{os.numero}</span>
                  <Badge text={os.statut||"Brouillon"} color={{"Brouillon":"#94A3B8","Émis":"#3B82F6","Signé":"#8B5CF6","En cours":"#F59E0B","Terminé":"#10B981","Annulé":"#EF4444"}[os.statut]||"#94A3B8"}/>
                </div>
                <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{os.artisan_nom} • {(os.prestations||[]).length} prestation(s) • {fmtDate(os.date_emission)}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#1E3A5F",marginTop:4}}>{fmtMoney(os.montant_ttc||0)}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button onClick={()=>generateOSPdf({...os,chantier:ch.nom,adresse_chantier:ch.adresse})} title="PDF" style={detailBtn("#DC2626","#FEF2F2","#FECACA")}>📄 PDF</button>
                <button onClick={()=>generateOSExcel({...os,chantier:ch.nom,adresse_chantier:ch.adresse})} title="Excel" style={detailBtn("#047857","#ECFDF5","#A7F3D0")}>📊 XLS</button>
                {!readOnly && <><button onClick={async()=>{try{await SB.saveTemplate('os',`Template ${os.artisan_nom}`,`Template d'OS pour ${os.artisan_nom}`,{...os});addToast("Template créé","success");}catch(err){addToast("Erreur : "+(err?.message||"template"),"error");}}} title="Créer un template à partir de cet OS" style={detailBtn("#4338CA","#EEF2FF","#C7D2FE")}>💾 Template</button>
                <button onClick={()=>{setDetailForm(os);setDetailModal("editOS");}} title="Modifier" style={detailBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>✎ Modifier</button></>}
              </div>
            </div>
          ))
        }
      </Section>

      {/* COMPTES RENDUS */}
      <Section title="Comptes Rendus" count={chCR.length} color="#3B82F6">
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{setDetailForm({chantierId:ch.id,date:new Date().toISOString().split("T")[0],numero:(chCR.length+1),resume:"",participants:"",decisions:""});setDetailModal("newCR");}} style={{background:"#3B82F6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouveau CR</button>
        </div>}
        {chCR.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun CR pour ce chantier</p> :
          chCR.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>(
            <div key={cr.id} style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",display:"flex",flexDirection:m?"column":"row",justifyContent:"space-between",alignItems:m?"stretch":"flex-start",gap:8,minWidth:0,overflow:"hidden"}}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>CR n°{cr.numero}</span>
                  <span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span>
                </div>
                <div style={{fontSize:12,color:"#334155",lineHeight:1.5}}>{(cr.resume||"").substring(0,100)}{(cr.resume||"").length>100?"...":""}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button onClick={()=>generateCRPdf(cr,ch)} title="PDF" style={detailBtn("#DC2626","#FEF2F2","#FECACA")}>📄 PDF</button>
                <button onClick={()=>generateCRExcel(cr,ch)} title="Excel" style={detailBtn("#047857","#ECFDF5","#A7F3D0")}>📊 XLS</button>
                {!readOnly && <button onClick={()=>{setDetailForm(cr);setDetailModal("editCR");}} title="Modifier" style={detailBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>✎ Modifier</button>}
              </div>
            </div>
          ))
        }
      </Section>

      {/* TÂCHES */}
      <Section title="Tâches" count={chTasks.length} color="#F59E0B">
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{setDetailForm({chantierId:ch.id,titre:"",lot:"",statut:"En attente",priorite:"En attente",echeance:new Date().toISOString().split("T")[0]});setDetailModal("newTask");}} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvelle tâche</button>
        </div>}
        {chTasks.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucune tâche pour ce chantier</p> :
          chTasks.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:8,padding:"10px 12px",marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
              <button onClick={()=>{const updated={...t,statut:t.statut==="Terminé"?"En attente":"Terminé"};SB.upsertTask(updated);reload();}} style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${status[t.statut]||"#CBD5E1"}`,background:t.statut==="Terminé"?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",padding:0}}>
                {t.statut==="Terminé" && <Icon d={I.check} size={10} color="#fff"/>}
              </button>
              <div style={{flex:1,opacity:t.statut==="Terminé"?0.5:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>{t.lot} • {fmtDate(t.echeance)}</div>
              </div>
              <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>
              {!readOnly && <button onClick={()=>{setDetailForm(t);setDetailModal("editTask");}} style={{background:"#3B82F6",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>✎</button>}
            </div>
          ))
        }
      </Section>

      {/* INTERVENANTS */}
      <Section title="Intervenants" count={intervenants.length + (clientContact?1:0)} color="#10B981">
        {clientContact && (
          <div style={{background:"#fff",borderRadius:8,padding:12,marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)",borderLeft:"3px solid #3B82F6"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:13}}>{clientContact.nom}</span><Badge text="Client" color="#3B82F6"/></div>
            <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{clientContact.tel} • {clientContact.email}</div>
          </div>
        )}
        {intervenants.length===0 && !clientContact ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun intervenant lié via les OS</p> :
          intervenants.map(c=>(
            <div key={c.id} style={{background:"#fff",borderRadius:8,padding:12,marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)",borderLeft:`3px solid ${{"Artisan":"#F59E0B","Sous-traitant":"#8B5CF6","Prestataire":"#EC4899","Fournisseur":"#10B981"}[c.type]||"#94A3B8"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:13}}>{c.nom}</span><Badge text={c.type} color={{"Artisan":"#F59E0B","Sous-traitant":"#8B5CF6","Fournisseur":"#10B981"}[c.type]||"#94A3B8"}/></div>
              <div style={{fontSize:11,color:"#64748B"}}>{c.specialite||c.societe||""}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{c.tel} • {c.email}</div>
            </div>
          ))
        }
      </Section>

      {/* PLANNING */}
      {chPlanning.length>0 && (
        <Section title="Planning" count={chPlanning.length} color="#6366F1">
          {chPlanning.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:8,padding:"10px 14px",marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{p.tache}</div><div style={{fontSize:10,color:"#94A3B8"}}>{p.lot} • {fmtDate(p.debut)} → {fmtDate(p.fin)}</div></div>
              <div style={{width:80}}><PBar value={p.avancement} max={100} color="#6366F1" h={6}/><div style={{fontSize:10,fontWeight:700,color:"#6366F1",textAlign:"right",marginTop:2}}>{p.avancement}%</div></div>
            </div>
          ))}
        </Section>
      )}

      {/* NOTES INTERNES — cachées pour les clients (comme le placeholder l'indique) */}
      {!readOnly && <Section title="Notes internes" color="#64748B">
        <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:14}}>
          <textarea
            value={detailForm.notes_internes ?? ch.notes_internes ?? ""}
            onChange={e=>setDetailForm({...ch,...detailForm,notes_internes:e.target.value})}
            placeholder="Notes internes (non visibles par le client)..."
            style={{width:"100%",minHeight:80,border:"none",background:"transparent",fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",color:"#92400E",boxSizing:"border-box"}}
          />
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <button onClick={async()=>{await SB.upsertChantier({...ch,notes_internes:detailForm.notes_internes??ch.notes_internes??""});setDetailForm({});reload();addToast("Notes enregistrées","success");}} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
          </div>
        </div>
      </Section>}

      {/* COMMENTAIRES - Using Phase 2 Component + Phase 3 Hook */}
      <CommentsSection
        comments={comments}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        currentUser={user}
        userRole={profile?.role}
      />

      {/* PARTAGE — masqué pour les clients MOA */}
      {!readOnly && <SharingPanel
        shares={shares}
        onAddShare={addShare}
        onDeleteShare={deleteShare}
      />}

      {/* MODALES POUR OS/CR/TÂCHES */}
      <Modal open={detailModal==="newOS"||detailModal==="editOS"} onClose={()=>setDetailModal(null)} title={detailModal==="newOS"?"Nouvel Ordre de Service":"Modifier l'OS"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="N° OS"><input style={inp} value={detailForm.numero||""} onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/></FF>
          <FF label="Artisan"><select style={sel} value={detailForm.artisan_nom||""} onChange={e=>setDetailForm({...detailForm,artisan_nom:e.target.value})}><option value="">— Sélectionner —</option>{data.contacts.filter(c=>c.type==="Artisan").map(a=><option key={a.id} value={a.nom}>{a.nom}</option>)}</select></FF>
          <FF label="Date émission"><input type="date" style={inp} value={detailForm.date_emission||""} onChange={e=>setDetailForm({...detailForm,date_emission:e.target.value})}/></FF>
          <FF label="Montant TTC €"><input type="number" style={inp} value={detailForm.montant_ttc||""} onChange={e=>setDetailForm({...detailForm,montant_ttc:Number(e.target.value)})}/></FF>
          <FF label="Statut"><select style={sel} value={detailForm.statut||"Brouillon"} onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option></select></FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertOS({...detailForm,chantier_id:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="newCR"||detailModal==="editCR"} onClose={()=>setDetailModal(null)} title={detailModal==="newCR"?"Nouveau Compte Rendu":"Modifier le CR"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Date"><input type="date" style={inp} value={detailForm.date||""} onChange={e=>setDetailForm({...detailForm,date:e.target.value})}/></FF>
          <FF label="N°"><input type="number" style={inp} value={detailForm.numero||""} onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/></FF>
        </div>
        <FF label="Résumé"><textarea style={{...inp,minHeight:70,resize:"vertical"}} value={detailForm.resume||""} onChange={e=>setDetailForm({...detailForm,resume:e.target.value})}/></FF>
        <FF label="Participants"><input style={inp} value={detailForm.participants||""} onChange={e=>setDetailForm({...detailForm,participants:e.target.value})}/></FF>
        <FF label="Décisions"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={detailForm.decisions||""} onChange={e=>setDetailForm({...detailForm,decisions:e.target.value})}/></FF>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertCR({...detailForm,chantierId:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="newTask"||detailModal==="editTask"} onClose={()=>setDetailModal(null)} title={detailModal==="newTask"?"Nouvelle tâche":"Modifier la tâche"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Titre"><input style={inp} value={detailForm.titre||""} onChange={e=>setDetailForm({...detailForm,titre:e.target.value})}/></FF>
          <FF label="Lot"><input style={inp} value={detailForm.lot||""} onChange={e=>setDetailForm({...detailForm,lot:e.target.value})}/></FF>
          <FF label="Échéance"><input type="date" style={inp} value={detailForm.echeance||""} onChange={e=>setDetailForm({...detailForm,echeance:e.target.value})}/></FF>
          <FF label="Priorité"><select style={sel} value={detailForm.priorite||"En attente"} onChange={e=>setDetailForm({...detailForm,priorite:e.target.value})}><option>Urgent</option><option>En cours</option><option>En attente</option></select></FF>
          <FF label="Statut"><select style={sel} value={detailForm.statut||"En attente"} onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}><option>En attente</option><option>En cours</option><option>Terminé</option></select></FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertTask({...detailForm,chantierId:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="useTemplate"} onClose={()=>setDetailModal(null)} title="Utiliser un template d'OS">
        <TemplateSelector chOS={chOS} setDetailForm={setDetailForm} setDetailModal={setDetailModal} ch={ch} />
      </Modal>
    </div>);
  }

  // ─── LIST VIEW (default) ───
  // chantiersFiltered est memoizé en haut du composant

  const hasFilters = !!(q || filterStatut || filterPhase);
  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10}}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Chantiers</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {data.chantiers.length} au total
          {hasFilters && <> · <strong>{chantiersFiltered.length}</strong> affiché{chantiersFiltered.length>1?"s":""}</>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:0.5}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher nom, client, adresse… (tape /)"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{padding:"7px 10px 7px 28px",borderRadius:7,border:"1px solid #E2E8F0",fontSize:12,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}
          />
        </div>
        {!readOnly && <button onClick={openNew} title="Nouveau chantier (raccourci : n)" style={{...btnP,fontSize:12,display:"inline-flex",alignItems:"center",gap:4}}>
          <Icon d={I.plus} size={14} color="#fff"/> Nouveau
        </button>}
      </div>
    </div>
    {/* Pills de filtre — statut */}
    <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",overflowX:m?"auto":"visible",paddingBottom:m?4:0}}>
      <span style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.05em",alignSelf:"center",marginRight:4}}>Statut</span>
      <button onClick={()=>setFilterStatut("")} style={pillStyle(filterStatut==="", "#1E3A5F")}>
        <span style={pillDot(filterStatut==="", "#64748B")}/>Tous
      </button>
      {PROJECT_STATUSES.map(s => {
        const active = filterStatut === s;
        const color = status[s] || "#1E3A5F";
        return (
          <button key={s} onClick={()=>setFilterStatut(active?"":s)} style={pillStyle(active, color)}>
            <span style={pillDot(active, color)}/>{s}
          </button>
        );
      })}
    </div>
    {/* Pills de filtre — phase */}
    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",overflowX:m?"auto":"visible",paddingBottom:m?4:0}}>
      <span style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:"0.05em",alignSelf:"center",marginRight:4}}>Phase</span>
      <button onClick={()=>setFilterPhase("")} style={pillStyle(filterPhase==="", "#1E3A5F")}>
        <span style={pillDot(filterPhase==="", "#64748B")}/>Toutes
      </button>
      {PROJECT_PHASES.map(p => {
        const active = filterPhase === p;
        const color = phase[p] || "#1E3A5F";
        return (
          <button key={p} onClick={()=>setFilterPhase(active?"":p)} style={pillStyle(active, color)}>
            <span style={pillDot(active, color)}/>{p}
          </button>
        );
      })}
    </div>
    {chantiersFiltered.length === 0 ? (
      <div style={{background:"#fff",borderRadius:12,padding:"40px 24px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>🏗️</div>
        {hasFilters ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>Essaie d'élargir ta recherche ou de changer les filtres.</div>
            <button onClick={()=>{setQ("");setFilterStatut("");setFilterPhase("");}} style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
          </>
        ) : (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun chantier</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>Démarre en créant ton premier chantier.</div>
            <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouveau chantier</button>
          </>
        )}
      </div>
    ) : (
    <div style={{display:"grid",gap:12}}>
      {chantiersFiltered.map(ch=>(
        <div key={ch.id} onClick={()=>setSelected(ch.id)} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${phase[ch.phase]||"#94A3B8"}`,cursor:"pointer",transition:"all .2s"}}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateX(4px)";}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.06)";e.currentTarget.style.transform="";}}>
          {ch.photo_couverture && <div style={{height:80,overflow:"hidden"}}><img src={ch.photo_couverture} alt={ch.nom} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
          <div style={{padding:m?14:18,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}><span style={{fontSize:m?14:16,fontWeight:700}}>{ch.nom}</span><Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/><Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/></div>
              <div style={{fontSize:12,color:"#64748B"}}>{ch.client} — {ch.adresse}</div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:11,color:"#94A3B8"}}>
                <span>{(data.ordresService||[]).filter(o=>o.chantier_id===ch.id).length} OS</span>
                <span>{(data.compteRendus||[]).filter(c=>(c.chantierId||c.chantier_id)===ch.id).length} CR</span>
                <span>{(data.tasks||[]).filter(t=>(t.chantierId||t.chantier_id)===ch.id).length} tâches</span>
              </div>
            </div>
            {!readOnly && <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setForm({...ch,lots:ch.lots?.join(", ")||"",budget:String(ch.budget),depenses:String(ch.depenses),dateDebut:ch.date_debut||ch.dateDebut||"",dateFin:ch.date_fin||ch.dateFin||"",photo_couverture:ch.photo_couverture||"",notes_internes:ch.notes_internes||""});setModal("edit");}} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.edit} size={14} color="#64748B"/></button>
              <button onClick={()=>handleDelete(ch)} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
            </div>}
          </div>
          <div style={{padding:`0 ${m?14:18}px ${m?14:18}px`,marginTop:-4}}>
            {(() => {
              const start = new Date(ch.date_debut || ch.dateDebut);
              const end = new Date(ch.date_fin || ch.dateFin);
              const now = new Date();
              const total = end.getTime() - start.getTime();
              const elapsed = Math.max(0, Math.min(total, now.getTime() - start.getTime()));
              const progress = total > 0 ? Math.round((elapsed / total) * 100) : 0;
              const isDone = ch.statut === "Terminé";
              const color = isDone ? "#10B981" : phase[ch.phase] || "#3B82F6";
              return (
                <>
                  <PBar value={isDone ? 100 : Math.min(progress, 100)} max={100} color={color}/>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"#94A3B8"}}>
                    <span>{fmtDate(start)} → {fmtDate(end)}</span>
                    <span style={{color, fontWeight:600}}>{isDone ? "Terminé" : progress + "%"}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
    )}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau chantier":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Client"><input style={inp} value={form.client||""} onChange={e=>setForm({...form,client:e.target.value})}/></FF>
        <FF label="Adresse"><input style={inp} value={form.adresse||""} onChange={e=>setForm({...form,adresse:e.target.value})}/></FF>
        <FF label="Phase"><select style={sel} value={form.phase||""} onChange={e=>setForm({...form,phase:e.target.value})}><option>Hors d'air</option><option>Technique</option><option>Finitions</option><option>Avant-projet</option><option>Études</option><option>Gros œuvre</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>En attente</option><option>Terminé</option></select></FF>
        <FF label="Budget €"><input type="number" style={inp} value={form.budget||""} onChange={e=>setForm({...form,budget:e.target.value})}/></FF>
        <FF label="Dépenses €"><input type="number" style={inp} value={form.depenses||""} onChange={e=>setForm({...form,depenses:e.target.value})}/></FF>
        <FF label="Début"><input type="date" style={inp} value={form.dateDebut||""} onChange={e=>setForm({...form,dateDebut:e.target.value})}/></FF>
        <FF label="Fin"><input type="date" style={inp} value={form.dateFin||""} onChange={e=>setForm({...form,dateFin:e.target.value})}/></FF>
        <FF label="Lots (virgules)"><input style={inp} value={form.lots||""} onChange={e=>setForm({...form,lots:e.target.value})}/></FF>
        <FF label="Photo de couverture (URL)" style={{gridColumn:"1 / -1"}}><input style={inp} value={form.photo_couverture||""} onChange={e=>setForm({...form,photo_couverture:e.target.value})} placeholder="https://... ou laisser vide"/></FF>
      </div>
      <FF label="Notes internes"><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={form.notes_internes||""} onChange={e=>setForm({...form,notes_internes:e.target.value})} placeholder="Remarques internes (non visibles par le client)..."/></FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} disabled={saving} style={{...btnP,opacity:saving?0.7:1}}>{saving?"⏳ Enregistrement…":"Enregistrer"}</button></div>
    </Modal>
  </div>);
}

// Style partagé pour les pills de filtre (statut / phase)
const pillStyle = (active, color) => ({
  display:"inline-flex",alignItems:"center",gap:6,
  padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
  border:`1px solid ${active ? color : "#E2E8F0"}`,
  background:active ? color : "#fff",
  color:active ? "#fff" : "#334155",
  cursor:"pointer",fontFamily:"inherit",
  transition:"background .15s, color .15s, border-color .15s",
  whiteSpace:"nowrap",
})
const pillDot = (active, color) => ({
  width:7,height:7,borderRadius:"50%",
  background:active?"#fff":color,
  opacity:active?0.8:1,
})
