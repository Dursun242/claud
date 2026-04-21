'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  SB, Icon, I, phase, status, fmtDate, fmtMoney,
  FF, inp, sel, btnP, btnS
} from '../dashboards/shared'
import {
  Badge, Modal, AttachmentsSection, CommentsSection, TemplateSelector,
  ProcesVerbalReception, ChantierIntervenants, ChantierPlanning, ChantierBudgetCard,
} from '../components'
import ChantierCard from '../components/projects/ChantierCard'
import ProjectsFilterPills from '../components/projects/ProjectsFilterPills'
import { useAttachments } from '../hooks/useAttachments'
import { useComments } from '../hooks/useComments'
import { generateOSPdf, generateCRPdf, generateOSExcel, generateCRExcel } from '../generators'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { computeChantierFinances } from '../lib/chantierFinances'
import { supabase } from '../supabaseClient'

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

// Titre de section avec badge de compteur. Extrait en module-level : si on
// le redéfinissait dans le render, React considérerait un nouveau type à
// chaque frappe → démontage/remontage de tous les enfants (OS, PV, PJ…).
function Section({ title, count, color, children }) {
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <h3 style={{margin:0,fontSize:14,fontWeight:700,color:"#0F172A"}}>{title}</h3>
        {count !== undefined && (
          <span style={{
            background:(color||"#3B82F6")+"18",color:color||"#3B82F6",
            fontSize:11,fontWeight:700,borderRadius:10,padding:"2px 8px"
          }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  )
}

export default function ProjectsV({ data, save: _save, m, reload, user, profile, focusId, focusTs, readOnly }) {
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

  // Sync auto (silencieuse, une fois par montage de page) des signatures
  // Odoo → Supabase. Permet aux statuts des OS affichés dans le détail
  // chantier d'être à jour même si l'utilisateur n'est pas passé par
  // l'onglet OS. L'API renvoie vite si rien à synchroniser.
  const sigsSyncedRef = useRef(false);
  useEffect(() => {
    if (sigsSyncedRef.current) return;
    sigsSyncedRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/odoo/sync-signatures', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (payload?.updated > 0) reload();
      } catch (_) { /* silencieux : pas bloquant pour la page */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Calculs budget ↔ OS : logique métier centralisée dans
    // lib/chantierFinances.js pour que tous les écrans partagent
    // la même définition de "engagé / réalisé / brouillon".
    const finances = computeChantierFinances(ch.budget, chOS);

    return { chTasks, chOS, chCR, chPlanning, intervenants, clientContact, finances };
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

  // Compteurs (OS/CR/tâches/PJ) pré-calculés par chantier.
  // Avant, chaque carte faisait 4 .filter() O(N) → O(N²) au total.
  // Un seul passage permet de calculer la Map chantier_id → counts.
  const countsByChantier = useMemo(() => {
    const map = new Map()
    const bump = (id, key) => {
      if (!id) return
      const cur = map.get(id) || { os: 0, cr: 0, tasks: 0, attachments: 0 }
      cur[key]++
      map.set(id, cur)
    };
    (data.ordresService || []).forEach(o => bump(o.chantier_id, 'os'));
    (data.compteRendus || []).forEach(c => bump(c.chantierId || c.chantier_id, 'cr'));
    (data.tasks || []).forEach(t => bump(t.chantierId || t.chantier_id, 'tasks'));
    (data.attachments || []).forEach(a => bump(a.chantier_id, 'attachments'));
    return map
  }, [data.ordresService, data.compteRendus, data.tasks, data.attachments]);

  // Focus depuis la recherche globale : ouvre directement la vue détail
  // du chantier correspondant.
  useEffect(() => {
    if (!focusId) return;
    const exists = (data.chantiers || []).some(c => c.id === focusId);
    if (exists) setSelected(focusId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs]);

  const openNew=()=>{
    setForm({nom:"",client:"",adresse:"",phase:"Hors d'air",
      statut:"Planifié",budget:"",dateDebut:"",dateFin:"",
      lots:"",photo_couverture:"",notes_internes:""});
    setModal("new");
  };
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
      const lots = typeof form.lots === "string"
        ? (form.lots||"").split(",").map(l=>l.trim()).filter(Boolean)
        : form.lots||[];
      const e = {...form, budget:Number(form.budget)||0, lots};
      await SB.upsertChantier(e);
      setModal(null);
      reload();
      addToast("Chantier enregistré","success");
    } catch(err) {
      addToast("Erreur : "+err.message,"error");
    } finally { setSaving(false); }
  };
  const handleDelete = useCallback(async (ch) => {
    const ok = await confirm({
      title: `Supprimer le chantier « ${ch.nom} » ?`,
      message: "Le chantier sera supprimé, mais les OS, CR et tâches associés"
        +" ne seront pas effacés. Cette action est irréversible.",
      confirmLabel: "Supprimer le chantier",
      danger: true,
    });
    if (!ok) return;
    try { await SB.deleteChantier(ch.id); setSelected(null); reload(); addToast("Chantier supprimé", "success"); }
    catch (err) { addToast("Erreur : " + (err?.message || "suppression impossible"), "error"); }
  }, [confirm, reload, addToast]);

  // Ouvrir le détail d'un chantier : stable via useCallback pour que
  // ChantierCard (memo) ne re-render pas à chaque frappe dans la recherche.
  const handleOpenChantier = useCallback((ch) => {
    setSelected(ch.id);
    try {
      SB.log('view', 'chantier', ch.id, `Ouverture chantier — ${ch.nom}`,
        { phase: ch.phase || null, statut: ch.statut || null })
    } catch (_) {}
  }, []);

  const handleEditChantier = useCallback((ch) => {
    setForm({
      ...ch,
      lots: ch.lots?.join(", ") || "",
      budget: String(ch.budget || ""),
      dateDebut: ch.date_debut || ch.dateDebut || "",
      dateFin: ch.date_fin || ch.dateFin || "",
      photo_couverture: ch.photo_couverture || "",
      notes_internes: ch.notes_internes || "",
    });
    setModal("edit");
  }, []);

  // Phase 3 Hooks handle loading data automatically - no useEffect needed!

  // If a chantier is selected, show detail view
  if (selected) {
    const ch = selectedChantier;
    if (!ch) { setSelected(null); return null; }

    // Données dérivées memoizées (voir useMemo plus haut)
    const { chTasks, chOS, chCR, chPlanning, intervenants, clientContact, finances } = selectedRelated;

    return (<div>
      {/* Back button + Header */}
      <button onClick={()=>setSelected(null)} style={{
        background:"none",border:"none",cursor:"pointer",
        display:"flex",alignItems:"center",gap:6,
        color:"#3B82F6",fontSize:13,fontWeight:600,
        marginBottom:16,fontFamily:"inherit",padding:0
      }}>
        ← Retour aux chantiers
      </button>

      {/* Photo de couverture */}
      {ch.photo_couverture && (
        <div style={{borderRadius:14,overflow:"hidden",marginBottom:16,height:180,position:"relative"}}>
          <Image src={ch.photo_couverture} alt={ch.nom}
            fill sizes="(max-width: 768px) 100vw, 960px" priority
            style={{objectFit:"cover"}}/>
          <div style={{
            position:"absolute",inset:0,
            background:"linear-gradient(to top, rgba(15,23,42,0.5) 0%, transparent 60%)"
          }}/>
          <h1 style={{
            position:"absolute",bottom:16,left:20,margin:0,
            fontSize:m?20:26,fontWeight:700,color:"#fff",
            textShadow:"0 2px 8px rgba(0,0,0,0.4)"
          }}>{ch.nom}</h1>
        </div>
      )}

      {/* Chantier Header Card */}
      <div style={{
        background:"#fff",borderRadius:14,padding:m?16:24,
        boxShadow:"0 2px 8px rgba(0,0,0,0.06)",
        borderLeft:`5px solid ${phase[ch.phase]||"#3B82F6"}`,
        marginBottom:20
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              <h1 style={{margin:0,fontSize:m?20:26,fontWeight:700,color:"#0F172A"}}>{ch.nom}</h1>
              <Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/>
              <Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/>
            </div>
            <div style={{fontSize:14,color:"#64748B",marginBottom:2}}>{ch.client}</div>
            <div style={{fontSize:13,color:"#94A3B8"}}>{ch.adresse}</div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>
              Du {fmtDate(ch.date_debut||ch.dateDebut)} au {fmtDate(ch.date_fin||ch.dateFin)}
            </div>
            {ch.lots?.length>0 && (
              <div style={{fontSize:11,color:"#CBD5E1",marginTop:4}}>
                Lots : {ch.lots.join(", ")}
              </div>
            )}
          </div>
          {!readOnly && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button
              onClick={async()=>{await SB.duplicateChantier(ch);reload();}}
              style={{...btnS,fontSize:12,padding:"8px 14px"}}>Dupliquer</button>
            <button onClick={()=>{
              setForm({...ch,
                lots:ch.lots?.join(", ")||"",
                budget:String(ch.budget||""),
                dateDebut:ch.date_debut||ch.dateDebut||"",
                dateFin:ch.date_fin||ch.dateFin||""
              });setModal("edit");
            }} style={{...btnS,fontSize:12,padding:"8px 14px"}}>Modifier</button>
            <button onClick={()=>setDetailModal("share")}
              style={{...btnS,fontSize:12,padding:"8px 14px"}}>
              👥 Partager
            </button>
          </div>}
        </div>
        {/* Budget + gauge — composant dédié, consomme `finances` calculé via lib/chantierFinances */}
        <ChantierBudgetCard finances={finances} m={m} />
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
          <button onClick={()=>{
            const nextNum=`OS-2026-${String(chOS.length+1).padStart(3,"0")}`;
            setDetailForm({
              numero:nextNum,chantier_id:ch.id,
              date_emission:new Date().toISOString().split("T")[0],
              statut:"Brouillon",montant_ttc:0
            });setDetailModal("newOS");
          }} style={{background:"#8B5CF6",color:"#fff",border:"none",
            borderRadius:6,padding:"6px 12px",
            fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvel OS</button>
          <button onClick={()=>setDetailModal("useTemplate")} style={{
            background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,
            padding:"6px 12px",fontSize:11,fontWeight:700,
            cursor:"pointer",opacity:0.7}}>📋 Template</button>
        </div>}
        {chOS.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun OS pour ce chantier</p> :
          chOS.map(os=>(
            // Sur mobile : colonne (titre au-dessus, boutons en dessous)
            // Sur desktop : ligne (titre à gauche, boutons à droite)
            <div key={os.id} style={{
              background:"#fff",borderRadius:10,padding:12,marginBottom:8,
              boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
              display:"flex",flexDirection:m?"column":"row",
              justifyContent:"space-between",
              alignItems:m?"stretch":"flex-start",
              gap:8,minWidth:0,overflow:"hidden"
            }}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#0F172A",whiteSpace:"nowrap"}}>{os.numero}</span>
                  <Badge text={os.statut||"Brouillon"} color={{
                    "Brouillon":"#94A3B8","Émis":"#3B82F6","Signé":"#8B5CF6",
                    "En cours":"#F59E0B","Terminé":"#10B981","Annulé":"#EF4444"
                  }[os.statut]||"#94A3B8"}/>
                </div>
                <div style={{
                  fontSize:11,color:"#64748B",overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>
                  {os.artisan_nom} • {(os.prestations||[]).length} prestation(s) • {fmtDate(os.date_emission)}
                </div>
                <div style={{
                  fontSize:16,fontWeight:700,color:"#1E3A5F",marginTop:4
                }}>{fmtMoney(os.montant_ttc||0)}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button title="PDF" style={detailBtn("#DC2626","#FEF2F2","#FECACA")}
                  onClick={()=>generateOSPdf({...os,chantier:ch.nom,adresse_chantier:ch.adresse})}>📄 PDF</button>
                <button title="Excel" style={detailBtn("#047857","#ECFDF5","#A7F3D0")}
                  onClick={()=>generateOSExcel({...os,chantier:ch.nom,adresse_chantier:ch.adresse})}>📊 XLS</button>
                {!readOnly && <>
                  <button onClick={async()=>{
                    try{
                      await SB.saveTemplate('os',
                        `Template ${os.artisan_nom}`,
                        `Template d'OS pour ${os.artisan_nom}`,{...os});
                      addToast("Template créé","success");
                    }catch(err){
                      addToast("Erreur : "+(err?.message||"template"),"error");
                    }
                  }} title="Créer un template à partir de cet OS"
                  style={detailBtn("#4338CA","#EEF2FF","#C7D2FE")}>💾 Template</button>
                  <button onClick={()=>{setDetailForm(os);setDetailModal("editOS");}}
                    title="Modifier"
                    style={detailBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>✎ Modifier</button>
                </>}
              </div>
            </div>
          ))
        }
      </Section>

      {/* COMPTES RENDUS */}
      <Section title="Comptes Rendus" count={chCR.length} color="#3B82F6">
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{
            setDetailForm({chantierId:ch.id,
              date:new Date().toISOString().split("T")[0],
              numero:(chCR.length+1),
              resume:"",participants:"",decisions:""
            });setDetailModal("newCR");
          }} style={{background:"#3B82F6",color:"#fff",border:"none",
            borderRadius:6,padding:"6px 12px",
            fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouveau CR</button>
        </div>}
        {chCR.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun CR pour ce chantier</p> :
          chCR.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>(
            <div key={cr.id} style={{
              background:"#fff",borderRadius:10,padding:12,marginBottom:8,
              boxShadow:"0 1px 2px rgba(0,0,0,0.04)",
              display:"flex",flexDirection:m?"column":"row",
              justifyContent:"space-between",
              alignItems:m?"stretch":"flex-start",
              gap:8,minWidth:0,overflow:"hidden"
            }}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{
                    background:"#1E3A5F",color:"#fff",borderRadius:5,
                    padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"
                  }}>CR n°{cr.numero}</span>
                  <span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span>
                </div>
                <div style={{fontSize:12,color:"#334155",lineHeight:1.5}}>
                  {(cr.resume||"").substring(0,100)}{(cr.resume||"").length>100?"...":""}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button onClick={()=>generateCRPdf(cr,ch)} title="PDF"
                  style={detailBtn("#DC2626","#FEF2F2","#FECACA")}>📄 PDF</button>
                <button onClick={()=>generateCRExcel(cr,ch)} title="Excel"
                  style={detailBtn("#047857","#ECFDF5","#A7F3D0")}>📊 XLS</button>
                {!readOnly && (
                  <button onClick={()=>{setDetailForm(cr);setDetailModal("editCR");}}
                    title="Modifier" style={detailBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>
                    ✎ Modifier
                  </button>
                )}
              </div>
            </div>
          ))
        }
      </Section>

      {/* PROCÈS-VERBAUX DE RÉCEPTION — juste avant les tâches, comme OS/CR */}
      {selectedChantier && selectedRelated && (
        <ProcesVerbalReception
          chantierId={selectedChantier.id}
          chantier={selectedChantier}
          ordresService={selectedRelated.chOS || []}
          clientContact={selectedRelated.clientContact}
          onRefresh={reload}
        />
      )}

      {/* TÂCHES — clients autorisés à créer/modifier leurs tâches */}
      <Section title="Tâches" count={chTasks.length} color="#F59E0B">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{
            setDetailForm({chantierId:ch.id,titre:"",lot:"",
              statut:"En attente",priorite:"En attente",
              echeance:new Date().toISOString().split("T")[0]
            });setDetailModal("newTask");
          }} style={{background:"#F59E0B",color:"#fff",border:"none",
            borderRadius:6,padding:"6px 12px",
            fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvelle tâche</button>
        </div>
        {chTasks.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucune tâche pour ce chantier</p> :
          chTasks.map(t=>(
            <div key={t.id} style={{
              display:"flex",alignItems:"center",gap:10,
              background:"#fff",borderRadius:8,padding:"10px 12px",
              marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"
            }}>
              <button
                onClick={()=>{
                  const updated={...t,statut:t.statut==="Terminé"?"En attente":"Terminé"};
                  SB.upsertTask(updated);reload();
                }}
                style={{
                  width:20,height:20,minWidth:20,minHeight:20,
                  borderRadius:"50%",
                  border:`2px solid ${status[t.statut]||"#CBD5E1"}`,
                  background:t.statut==="Terminé"?"#10B981":"transparent",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,cursor:"pointer",padding:0,
                  boxSizing:"border-box",appearance:"none",WebkitAppearance:"none"
                }}>
                {t.statut==="Terminé" && <Icon d={I.check} size={10} color="#fff"/>}
              </button>
              <div style={{flex:1,opacity:t.statut==="Terminé"?0.5:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>{t.lot} • {fmtDate(t.echeance)}</div>
              </div>
              <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>
              <button onClick={()=>{setDetailForm(t);setDetailModal("editTask");}}
                style={{background:"#3B82F6",border:"none",borderRadius:5,
                  padding:"4px 10px",cursor:"pointer",fontSize:9,
                  fontWeight:700,color:"#fff",flexShrink:0}}>✎</button>
            </div>
          ))
        }
      </Section>

      {/* INTERVENANTS + PLANNING — composants dédiés, lecture seule */}
      <ChantierIntervenants intervenants={intervenants} clientContact={clientContact} />
      <ChantierPlanning items={chPlanning} />

      {/* NOTES INTERNES — cachées pour les clients (comme le placeholder l'indique) */}
      {!readOnly && <Section title="Notes internes" color="#64748B">
        <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:14}}>
          <textarea
            value={detailForm.notes_internes ?? ch.notes_internes ?? ""}
            onChange={e=>setDetailForm({...ch,...detailForm,notes_internes:e.target.value})}
            placeholder="Notes internes (non visibles par le client)..."
            style={{
              width:"100%",minHeight:80,border:"none",
              background:"transparent",fontSize:13,fontFamily:"inherit",
              resize:"vertical",outline:"none",
              color:"#92400E",boxSizing:"border-box"
            }}
          />
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <button onClick={async()=>{
              await SB.upsertChantier({...ch,
                notes_internes:detailForm.notes_internes??ch.notes_internes??""
              });setDetailForm({});reload();addToast("Notes enregistrées","success");
            }} style={{background:"#F59E0B",color:"#fff",border:"none",
              borderRadius:6,padding:"5px 14px",
              fontSize:11,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
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

      {/* MODALES POUR OS/CR/TÂCHES */}
      <Modal
        open={detailModal==="newOS"||detailModal==="editOS"}
        onClose={()=>setDetailModal(null)}
        title={detailModal==="newOS"?"Nouvel Ordre de Service":"Modifier l'OS"}
      >
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="N° OS">
            <input style={inp} value={detailForm.numero||""}
              onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/>
          </FF>
          <FF label="Artisan">
            <select style={sel} value={detailForm.artisan_nom||""}
              onChange={e=>setDetailForm({...detailForm,artisan_nom:e.target.value})}>
              <option value="">— Sélectionner —</option>
              {data.contacts.filter(c=>c.type==="Artisan").map(a=>(
                <option key={a.id} value={a.nom}>{a.nom}</option>
              ))}
            </select>
          </FF>
          <FF label="Date émission">
            <input type="date" style={inp} value={detailForm.date_emission||""}
              onChange={e=>setDetailForm({...detailForm,date_emission:e.target.value})}/>
          </FF>
          <FF label="Montant TTC €">
            <input type="number" style={inp} value={detailForm.montant_ttc||""}
              onChange={e=>setDetailForm({...detailForm,montant_ttc:Number(e.target.value)})}/>
          </FF>
          <FF label="Statut">
            <select style={sel} value={detailForm.statut||"Brouillon"}
              onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}>
              <option>Brouillon</option><option>Émis</option>
              <option>Signé</option><option>En cours</option><option>Terminé</option>
            </select>
          </FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button>
          <button onClick={async()=>{
            await SB.upsertOS({...detailForm,chantier_id:ch.id});
            setDetailModal(null);reload();
          }} style={btnP}>Enregistrer</button>
        </div>
      </Modal>

      <Modal
        open={detailModal==="newCR"||detailModal==="editCR"}
        onClose={()=>setDetailModal(null)}
        title={detailModal==="newCR"?"Nouveau Compte Rendu":"Modifier le CR"}
      >
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Date">
            <input type="date" style={inp} value={detailForm.date||""}
              onChange={e=>setDetailForm({...detailForm,date:e.target.value})}/>
          </FF>
          <FF label="N°">
            <input type="number" style={inp} value={detailForm.numero||""}
              onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/>
          </FF>
        </div>
        <FF label="Résumé">
          <textarea style={{...inp,minHeight:70,resize:"vertical"}}
            value={detailForm.resume||""}
            onChange={e=>setDetailForm({...detailForm,resume:e.target.value})}/>
        </FF>
        <FF label="Participants">
          <input style={inp} value={detailForm.participants||""}
            onChange={e=>setDetailForm({...detailForm,participants:e.target.value})}/>
        </FF>
        <FF label="Décisions">
          <textarea style={{...inp,minHeight:50,resize:"vertical"}}
            value={detailForm.decisions||""}
            onChange={e=>setDetailForm({...detailForm,decisions:e.target.value})}/>
        </FF>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button>
          <button onClick={async()=>{
            await SB.upsertCR({...detailForm,chantierId:ch.id});
            setDetailModal(null);reload();
          }} style={btnP}>Enregistrer</button>
        </div>
      </Modal>

      <Modal
        open={detailModal==="newTask"||detailModal==="editTask"}
        onClose={()=>setDetailModal(null)}
        title={detailModal==="newTask"?"Nouvelle tâche":"Modifier la tâche"}
      >
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Titre">
            <input style={inp} value={detailForm.titre||""}
              onChange={e=>setDetailForm({...detailForm,titre:e.target.value})}/>
          </FF>
          <FF label="Lot">
            <input style={inp} value={detailForm.lot||""}
              onChange={e=>setDetailForm({...detailForm,lot:e.target.value})}/>
          </FF>
          <FF label="Échéance">
            <input type="date" style={inp} value={detailForm.echeance||""}
              onChange={e=>setDetailForm({...detailForm,echeance:e.target.value})}/>
          </FF>
          <FF label="Priorité">
            <select style={sel} value={detailForm.priorite||"En attente"}
              onChange={e=>setDetailForm({...detailForm,priorite:e.target.value})}>
              <option>Urgent</option><option>En cours</option><option>En attente</option>
            </select>
          </FF>
          <FF label="Statut">
            <select style={sel} value={detailForm.statut||"En attente"}
              onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}>
              <option>En attente</option><option>En cours</option><option>Terminé</option>
            </select>
          </FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button>
          <button onClick={async()=>{
            await SB.upsertTask({...detailForm,chantierId:ch.id});
            setDetailModal(null);reload();
          }} style={btnP}>Enregistrer</button>
        </div>
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
    <div style={{
      display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Chantiers</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {data.chantiers.length} au total
          {hasFilters && <>
            {" "}· <strong>{chantiersFiltered.length}</strong>{" "}
            affiché{chantiersFiltered.length>1?"s":""}
          </>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{
            position:"absolute",left:9,top:"50%",
            transform:"translateY(-50%)",opacity:0.5
          }} width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="#64748B" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher nom, client, adresse… (tape /)"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{
              padding:"7px 10px 7px 28px",borderRadius:7,
              border:"1px solid #E2E8F0",fontSize:12,
              width:"100%",boxSizing:"border-box",fontFamily:"inherit"
            }}
          />
        </div>
        {!readOnly && <button onClick={openNew}
          title="Nouveau chantier (raccourci : n)"
          style={{...btnP,fontSize:12,display:"inline-flex",alignItems:"center",gap:4}}>
          <Icon d={I.plus} size={14} color="#fff"/> Nouveau
        </button>}
      </div>
    </div>
    {/* Pills de filtre (statut + phase). Masqué en vue client. */}
    {!readOnly && (
      <ProjectsFilterPills
        filterStatut={filterStatut}
        filterPhase={filterPhase}
        onStatut={setFilterStatut}
        onPhase={setFilterPhase}
        m={m}
      />
    )}
    {chantiersFiltered.length === 0 ? (
      <div style={{
        background:"#fff",borderRadius:12,padding:"40px 24px",
        textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>🏗️</div>
        {hasFilters ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
              Essaie d'élargir ta recherche ou de changer les filtres.
            </div>
            <button
              onClick={()=>{setQ("");setFilterStatut("");setFilterPhase("");}}
              style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
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
      {chantiersFiltered.map(ch => (
        <ChantierCard
          key={ch.id}
          ch={ch}
          counts={countsByChantier.get(ch.id) || { os: 0, cr: 0, tasks: 0, attachments: 0 }}
          m={m}
          readOnly={readOnly}
          onOpen={handleOpenChantier}
          onEdit={handleEditChantier}
          onDelete={handleDelete}
        />
      ))}
    </div>
    )}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau chantier":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom">
          <input style={inp} value={form.nom||""}
            onChange={e=>setForm({...form,nom:e.target.value})}/>
        </FF>
        <FF label="Client">
          <input style={inp} value={form.client||""}
            onChange={e=>setForm({...form,client:e.target.value})}/>
        </FF>
        <FF label="Adresse">
          <input style={inp} value={form.adresse||""}
            onChange={e=>setForm({...form,adresse:e.target.value})}/>
        </FF>
        <FF label="Phase">
          <select style={sel} value={form.phase||""}
            onChange={e=>setForm({...form,phase:e.target.value})}>
            <option>Hors d'air</option><option>Technique</option>
            <option>Finitions</option><option>Avant-projet</option>
            <option>Études</option><option>Gros œuvre</option>
          </select>
        </FF>
        <FF label="Statut">
          <select style={sel} value={form.statut||""}
            onChange={e=>setForm({...form,statut:e.target.value})}>
            <option>Planifié</option><option>En cours</option>
            <option>En attente</option><option>Terminé</option>
          </select>
        </FF>
        <FF label="Budget €"
          hint="Les dépenses sont calculées automatiquement depuis les OS du chantier">
          <input type="number" style={inp} value={form.budget||""}
            onChange={e=>setForm({...form,budget:e.target.value})}/>
        </FF>
        <FF label="Début">
          <input type="date" style={inp} value={form.dateDebut||""}
            onChange={e=>setForm({...form,dateDebut:e.target.value})}/>
        </FF>
        <FF label="Fin">
          <input type="date" style={inp} value={form.dateFin||""}
            onChange={e=>setForm({...form,dateFin:e.target.value})}/>
        </FF>
        <FF label="Lots (virgules)">
          <input style={inp} value={form.lots||""}
            onChange={e=>setForm({...form,lots:e.target.value})}/>
        </FF>
        <FF label="Photo de couverture (URL)" style={{gridColumn:"1 / -1"}}>
          <input style={inp} value={form.photo_couverture||""}
            onChange={e=>setForm({...form,photo_couverture:e.target.value})}
            placeholder="https://... ou laisser vide"/>
        </FF>
      </div>
      <FF label="Notes internes">
        <textarea style={{...inp,minHeight:60,resize:"vertical"}}
          value={form.notes_internes||""}
          onChange={e=>setForm({...form,notes_internes:e.target.value})}
          placeholder="Remarques internes (non visibles par le client)..."/>
      </FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} disabled={saving}
          style={{...btnP,opacity:saving?0.7:1}}>
          {saving?"⏳ Enregistrement…":"Enregistrer"}
        </button>
      </div>
    </Modal>
  </div>);
}

// Style partagé pour les pills de filtre (statut / phase)
